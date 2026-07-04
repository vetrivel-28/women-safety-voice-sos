package com.safeher.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.modules.core.DeviceEventManagerModule
import kotlin.math.abs
import kotlin.math.sqrt

class SafeHerMicrophoneService : Service() {

    private val SAMPLE_RATE = 16000
    private val CHANNEL_CONFIG = AudioFormat.CHANNEL_IN_MONO
    private val AUDIO_FORMAT = AudioFormat.ENCODING_PCM_16BIT
    private val CHUNK_SIZE = 16000

    @Volatile private var isCapturing = false
    private var audioRecord: AudioRecord? = null
    private var recordingThread: Thread? = null
    private var sequenceNumber = 0
    private var activeGeneration: Int = -1

    enum class ServiceState {
        IDLE, START_REQUESTED, RUNNING, STOP_REQUESTED
    }

    data class ServiceStateTracker(val state: ServiceState, val generation: Int)
    
    companion object {
        val stateLock = Any()
        var tracker = ServiceStateTracker(ServiceState.IDLE, 0)

        const val NOTIFICATION_ID = 54321
        const val CHANNEL_ID = "voice_monitoring_channel"
        const val ACTION_START = "com.safeher.app.START_MIC"
        const val ACTION_STOP = "com.safeher.app.STOP_MIC"
        
        // This holds a static reference to the React Context purely to emit events.
        // It should be set by the Module when it starts.
        @Volatile var reactContext: ReactApplicationContext? = null
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        Log.i("SafeHerMicService", "SERVICE_CREATED")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val intentGen = intent?.getIntExtra("generation", -1) ?: -1

        if (intent?.action == ACTION_STOP) {
            handleStopRequest(startId, intentGen)
            return START_NOT_STICKY
        }

        if (intent?.action == ACTION_START) {
            Log.i("SafeHerMicService", "SERVICE_START_REQUESTED")
            handleStartRequest(startId, intentGen)
        }

        return START_NOT_STICKY
    }

    private fun handleStartRequest(startId: Int, intentGen: Int) {
        var shouldPromote = false
        synchronized(stateLock) {
            val currentTracker = tracker
            if (currentTracker.generation == intentGen) {
                if (currentTracker.state == ServiceState.START_REQUESTED) {
                    tracker = currentTracker.copy(state = ServiceState.RUNNING)
                    shouldPromote = true
                } else if (currentTracker.state == ServiceState.RUNNING) {
                    Log.i("SafeHerMicService", "Duplicate START request for running gen $intentGen ignored.")
                    return
                }
            }
        }
        
        if (!shouldPromote) {
            Log.w("SafeHerMicService", "Stale START request: gen $intentGen ignored.")
            return
        }

        activeGeneration = intentGen

        if (isCapturing) {
            Log.w("SafeHerMicService", "Already capturing when new gen promoted, halting old capture.")
            cleanupHardware()
        }

        createNotificationChannel()
        val notification = buildNotification()
        try {
            ServiceCompat.startForeground(this, NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
        } catch (e: Exception) {
            Log.e("SafeHerMicService", "Foreground promotion failed", e)
            synchronized(stateLock) {
                val currentTracker = tracker
                if (currentTracker.generation == activeGeneration) {
                    tracker = currentTracker.copy(state = ServiceState.IDLE)
                }
            }
            activeGeneration = -1
            stopSelf(startId)
            return
        }

        Log.i("SafeHerMicService", "FOREGROUND_READY")
        emitState("FOREGROUND_READY")
        
        startAudioCapture(startId)
    }

    private fun startAudioCapture(startId: Int) {
        try {
            val minBufferSize = AudioRecord.getMinBufferSize(SAMPLE_RATE, CHANNEL_CONFIG, AUDIO_FORMAT)
            if (minBufferSize == AudioRecord.ERROR || minBufferSize == AudioRecord.ERROR_BAD_VALUE) {
                Log.e("SafeHerMicService", "AUDIORECORD_INIT_FAILED: Bad buffer size")
                emitState("MIC_START_FAILED")
                stopSelf(startId)
                return
            }

            audioRecord = AudioRecord(
                MediaRecorder.AudioSource.MIC,
                SAMPLE_RATE,
                CHANNEL_CONFIG,
                AUDIO_FORMAT,
                minBufferSize * 2
            )

            if (audioRecord?.state != AudioRecord.STATE_INITIALIZED) {
                Log.e("SafeHerMicService", "AUDIORECORD_INIT_FAILED: Not initialized")
                audioRecord = null
                emitState("MIC_START_FAILED")
                stopSelf(startId)
                return
            }

            Log.i("SafeHerMicService", "AUDIORECORD_CREATED")

            audioRecord?.startRecording()
            Log.i("SafeHerMicService", "RECORDING_STARTED")
            emitState("RECORDING_STARTED")
            
            isCapturing = true
            sequenceNumber = 0

            recordingThread = Thread {
                readAudioData()
            }
            recordingThread?.start()

        } catch (e: IllegalStateException) {
            Log.e("SafeHerMicService", "AUDIORECORD_START_FAILED: IllegalState", e)
            emitState("MIC_START_FAILED")
            cleanupHardware()
            stopSelf(startId)
        } catch (e: SecurityException) {
            Log.e("SafeHerMicService", "AUDIORECORD_START_FAILED: SecurityException", e)
            emitState("MIC_START_FAILED")
            cleanupHardware()
            stopSelf(startId)
        } catch (e: IllegalArgumentException) {
            Log.e("SafeHerMicService", "AUDIORECORD_INIT_FAILED: IllegalArgument", e)
            emitState("MIC_START_FAILED")
            cleanupHardware()
            stopSelf(startId)
        }
    }

    private fun handleStopRequest(startId: Int, intentGen: Int) {
        var validStop = false
        synchronized(stateLock) {
            val currentTracker = tracker
            if (currentTracker.generation == intentGen && activeGeneration == intentGen) {
                validStop = true
            }
        }

        if (!validStop) {
            Log.w("SafeHerMicService", "Stale STOP request: gen $intentGen ignored.")
            return
        }

        Log.i("SafeHerMicService", "STOP_REQUESTED for gen $activeGeneration")
        isCapturing = false
        
        try {
            audioRecord?.stop() // This safely unblocks a pending read()
        } catch (e: Exception) {
            // Ignored, AudioRecord might already be stopped
        }

        val thread = recordingThread
        if (thread != null) {
            try {
                thread.join(1500)
                if (thread.isAlive) {
                    Log.w("SafeHerMicService", "CAPTURE_THREAD_STOP_TIMEOUT")
                }
            } catch (e: InterruptedException) {
                // Ignore
            }
        }

        cleanupHardware()
        Log.i("SafeHerMicService", "RECORDING_STOPPED")
        
        emitState("RECORDING_STOPPED")
        
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        Log.i("SafeHerMicService", "FOREGROUND_STOPPED")
        
        stopSelf(startId)
    }

    private fun readAudioData() {
        try {
            val record = audioRecord ?: return
            val minBufferSize = AudioRecord.getMinBufferSize(SAMPLE_RATE, CHANNEL_CONFIG, AUDIO_FORMAT)
            val audioBuffer = ShortArray(minBufferSize)
            val chunkBuffer = ShortArray(CHUNK_SIZE)
            var chunkIndex = 0

            while (isCapturing) {
                val readSize = record.read(audioBuffer, 0, audioBuffer.size)
                if (readSize > 0) {
                    for (i in 0 until readSize) {
                        chunkBuffer[chunkIndex++] = audioBuffer[i]
                        if (chunkIndex >= CHUNK_SIZE) {
                            processChunk(chunkBuffer)
                            chunkIndex = 0
                        }
                    }
                } else if (readSize < 0) {
                    Log.e("SafeHerMicService", "AUDIORECORD_READ_ERROR: $readSize")
                    break
                }
            }
        } finally {
            // No cleanup here. We perform deterministic cleanup in handleStopRequest and onDestroy exactly once.
        }
    }

    private fun processChunk(chunk: ShortArray) {
        var peak = 0
        var sumSquares = 0.0

        for (sample in chunk) {
            val iSample = sample.toInt()
            val absVal = if (iSample == Short.MIN_VALUE.toInt()) Short.MAX_VALUE.toInt() else abs(iSample)
            if (absVal > peak) peak = absVal
            sumSquares += (sample.toDouble() * sample.toDouble())
        }

        val rms = sqrt(sumSquares / chunk.size) / 32768.0
        sequenceNumber++

        val formattedRms = String.format("%.4f", rms)
        Log.i("SafeHerAudioPOC", "chunk=$sequenceNumber samples=${chunk.size} peak=$peak rms=$formattedRms")

        val params = Arguments.createMap()
        params.putInt("sequenceNumber", sequenceNumber)
        params.putInt("sampleCount", chunk.size)
        params.putInt("peakAmplitude", peak)
        params.putDouble("rms", rms)
        params.putDouble("timestamp", System.currentTimeMillis().toDouble())

        reactContext?.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            ?.emit("onAudioMetrics", params)
    }

    private fun cleanupHardware() {
        audioRecord?.release()
        audioRecord = null
        recordingThread = null
        Log.i("SafeHerMicService", "AUDIORECORD_RELEASED")
    }

    override fun onDestroy() {
        super.onDestroy()
        isCapturing = false
        try { audioRecord?.stop() } catch (e: Exception) {}
        cleanupHardware()
        Log.i("SafeHerMicService", "SERVICE_DESTROYED for activeGen $activeGeneration")
        reactContext = null
        
        synchronized(stateLock) {
            val currentTracker = tracker
            if (activeGeneration != -1 && currentTracker.generation == activeGeneration) {
                if (currentTracker.state == ServiceState.RUNNING || currentTracker.state == ServiceState.STOP_REQUESTED) {
                    tracker = currentTracker.copy(state = ServiceState.IDLE)
                }
            }
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Voice Monitoring",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Microphone monitoring is active for SafeHer Journey"
            }
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.createNotificationChannel(channel)
        }
    }

    private fun buildNotification(): Notification {
        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
        val pendingIntentFlags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE
        } else {
            android.app.PendingIntent.FLAG_UPDATE_CURRENT
        }
        val pendingIntent = android.app.PendingIntent.getActivity(this, 0, launchIntent, pendingIntentFlags)

        val iconRes = resources.getIdentifier("ic_mic_notification", "drawable", packageName)
        val validIcon = if (iconRes != 0) iconRes else android.R.drawable.ic_dialog_info

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Voice SOS Active")
            .setContentText("Monitoring voice for your safety.")
            .setSmallIcon(validIcon)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    private fun emitState(state: String) {
        val params = Arguments.createMap()
        params.putString("state", state)
        reactContext?.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            ?.emit("onVoiceMonitoringState", params)
    }
}
