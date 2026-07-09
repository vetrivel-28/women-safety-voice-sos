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
import java.util.ArrayDeque
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.TimeUnit
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

    private val calibrationBuffer = DoubleArray(5)
    private var noiseFloor = 0.001
    private var currentClassification = "CALIBRATING"
    private var activeCount = 0
    private var quietCount = 0
    private var sustainedLoudCount = 0
    private var loudDecayCount = 0

    // POC 3B VAD State
    private var vadEngine: VadEngine? = null
    private var vadWorkerThread: Thread? = null
    private var vadQueue: ArrayBlockingQueue<ShortArray>? = null
    private val vadEngineRequiresReset = AtomicBoolean(false)

    @Volatile private var currentSpeechProb = 0.0
    @Volatile private var isSpeechDetected = false

    // POC 3B Speech Persistence State
    private var speechEnterCount = 0
    private var speechExitCount = 0

    // POC 5A ASR State
    private var asrWorkerThread: Thread? = null
    private var asrQueue: ArrayBlockingQueue<AsrSegment>? = null
    private var asrEngine: SafeHerOfflineAsrEngine? = null
    @Volatile private var isAsrWorkerRunning = false
    private var nextSegmentId = 1
    
    private data class AsrSegment(
        val id: Int,
        val samples: FloatArray,
        val finalizedAtMs: Long,
        val audioDurationMs: Double
    )

    // POC 4A Speech Segment Collector State
    private val speechPreRollFrames = ArrayDeque<ShortArray>()
    private val activeSpeechSegmentFrames = ArrayList<ShortArray>()
    private var isCollectingSpeechSegment = false
    private var speechSegmentStartTimeMs = 0L

    private var isSpeechEndPending = false
    private var speechEndHangoverFrameCount = 0

    private val speechEndHangoverFrameLimit =
        (
            (SPEECH_END_HANGOVER_MS * SAMPLE_RATE) +
                (1000 * VAD_FRAME_SIZE) - 1
        ) / (1000 * VAD_FRAME_SIZE)

    private val speechPreRollFrameLimit =
        (SPEECH_PRE_ROLL_MS * SAMPLE_RATE) / (1000 * VAD_FRAME_SIZE)

    private val speechMinSegmentSamples =
        (SPEECH_MIN_SEGMENT_MS * SAMPLE_RATE) / 1000

    private val speechMaxSegmentSamples =
        (SPEECH_MAX_SEGMENT_MS * SAMPLE_RATE) / 1000

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

        // POC 3A Constants
        const val CALIBRATION_CHUNKS = 5
        const val MIN_NOISE_FLOOR = 0.001
        const val MAX_NOISE_FLOOR = 0.05
        const val ALPHA_DOWN = 0.2
        const val ALPHA_UP = 0.02
        const val NOISE_UPDATE_MULTI = 2.0
        const val ACTIVE_RMS_MULTI = 3.0
        const val LOUD_RMS_ABS = 0.15
        const val LOUD_PEAK_ABS = 0.8
        const val ACTIVE_PERSIST = 3
        const val QUIET_PERSIST = 5
        const val SUSTAINED_LOUD_PERSIST = 2
        const val LOUD_DECAY_CHUNKS = 3

        // POC 3B Constants
        const val VAD_FRAME_SIZE = 512
        const val SPEECH_ENTER_THRESHOLD = 0.60
        const val SPEECH_EXIT_THRESHOLD = 0.30
        const val SPEECH_ENTER_FRAMES = 2
        const val SPEECH_EXIT_FRAMES = 10

        // POC 4A Speech Segment Collector Constants
        const val SPEECH_PRE_ROLL_MS = 500
        const val SPEECH_MIN_SEGMENT_MS = 250
        const val SPEECH_MAX_SEGMENT_MS = 15_000
        const val SPEECH_END_HANGOVER_MS = 700

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

            // POC 3A Reset
            noiseFloor = MIN_NOISE_FLOOR
            currentClassification = "CALIBRATING"
            activeCount = 0
            quietCount = 0
            sustainedLoudCount = 0
            loudDecayCount = 0

            // POC 3B Init
            try {
                if (vadEngine == null) vadEngine = VadEngine(this)
                // startup reset inherently safely called during generic VadEngine init

                vadQueue = ArrayBlockingQueue(10)
                vadEngineRequiresReset.set(false)

                currentSpeechProb = 0.0
                isSpeechDetected = false
                speechEnterCount = 0
                speechExitCount = 0

                vadWorkerThread = Thread {
                    vadWorkerLoop()
                }.apply { start() }

                Log.i("SafeHerMicService", "VAD Worker Initialized")
            } catch (e: Exception) {
                Log.e("SafeHerMicService", "VAD Worker Initialization Failed", e)
            }

            // Live ASR Init
            try {
                asrQueue = ArrayBlockingQueue(2)
                isAsrWorkerRunning = true
                nextSegmentId = 1
                asrWorkerThread = Thread {
                    asrWorkerLoop()
                }.apply { start() }
                Log.i("SafeHerLiveASR", "LIVE_ASR_WORKER_STARTED")
            } catch (e: Exception) {
                Log.e("SafeHerLiveASR", "Live ASR Worker Initialization Failed", e)
            }

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
            val vadBuffer = ShortArray(VAD_FRAME_SIZE)
            var chunkIndex = 0
            var vadIndex = 0

            while (isCapturing) {
                val readSize = record.read(audioBuffer, 0, audioBuffer.size)
                if (readSize > 0) {
                    for (i in 0 until readSize) {
                        val sample = audioBuffer[i]
                        chunkBuffer[chunkIndex++] = sample
                        vadBuffer[vadIndex++] = sample

                        // Enqueue 512-sample frame sequentially protecting Array mutation across boundaries
                        if (vadIndex >= VAD_FRAME_SIZE) {
                            val clone = vadBuffer.clone() // Deep copy isolation
                            val queue = vadQueue
                            if (queue != null) {
                                if (!queue.offer(clone)) {
                                    // Overflow Policy: Drop oldest continuously yielding continuity penalty natively
                                    queue.poll()
                                    queue.offer(clone)
                                    vadEngineRequiresReset.set(true)
                                }
                            }
                            vadIndex = 0
                        }

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

        val normalizedPeak = peak / 32768.0
        val normalizedRms = sqrt(sumSquares / chunk.size) / 32768.0
        sequenceNumber++

        if (sequenceNumber <= CALIBRATION_CHUNKS) {
            calibrationBuffer[sequenceNumber - 1] = normalizedRms
            currentClassification = "CALIBRATING"
            if (sequenceNumber == CALIBRATION_CHUNKS) {
                val sorted = calibrationBuffer.sorted()
                val lowerTwoMean = (sorted[0] + sorted[1]) / 2.0
                noiseFloor = maxOf(MIN_NOISE_FLOOR, minOf(MAX_NOISE_FLOOR, lowerTwoMean))

                val isActiveCandidate = (normalizedRms >= noiseFloor * ACTIVE_RMS_MULTI)
                if (isActiveCandidate) {
                    currentClassification = "ACTIVE_SOUND"
                } else {
                    currentClassification = "QUIET"
                }
            }
        } else {
            val targetFloor = maxOf(MIN_NOISE_FLOOR, minOf(MAX_NOISE_FLOOR, normalizedRms))

            if (targetFloor <= noiseFloor) {
                noiseFloor = (noiseFloor * (1 - ALPHA_DOWN)) + (targetFloor * ALPHA_DOWN)
            } else if (normalizedRms < noiseFloor * NOISE_UPDATE_MULTI) {
                noiseFloor = (noiseFloor * (1 - ALPHA_UP)) + (targetFloor * ALPHA_UP)
            }

            val isImpulsiveLoud = (normalizedPeak >= LOUD_PEAK_ABS)
            val isSustainedLoudCandidate = (normalizedRms >= LOUD_RMS_ABS)
            val isActiveCandidate = (normalizedRms >= noiseFloor * ACTIVE_RMS_MULTI)

            if (isImpulsiveLoud || isSustainedLoudCandidate) {
                loudDecayCount = 0
            } else {
                loudDecayCount++
            }

            if (isSustainedLoudCandidate) sustainedLoudCount++ else sustainedLoudCount = 0
            if (isActiveCandidate) activeCount++ else activeCount = 0
            if (!isActiveCandidate && !isSustainedLoudCandidate && !isImpulsiveLoud) quietCount++ else quietCount = 0

            var nextClass = currentClassification
            if (isImpulsiveLoud || sustainedLoudCount >= SUSTAINED_LOUD_PERSIST) {
                nextClass = "LOUD_EVENT"
                quietCount = 0
            } else if (currentClassification == "LOUD_EVENT" && loudDecayCount >= LOUD_DECAY_CHUNKS) {
                if (isActiveCandidate) {
                    nextClass = "ACTIVE_SOUND"
                } else {
                    nextClass = "QUIET"
                }
            } else if (activeCount >= ACTIVE_PERSIST) {
                nextClass = "ACTIVE_SOUND"
            } else if (quietCount >= QUIET_PERSIST) {
                nextClass = "QUIET"
            }
            currentClassification = nextClass
        }

        val calibrationProgress = minOf(CALIBRATION_CHUNKS, sequenceNumber)

        val formattedRms = String.format("%.4f", normalizedRms)
        val formattedPeak = String.format("%.4f", normalizedPeak)
        val formattedFloor = String.format("%.4f", noiseFloor)
        val formattedProb = String.format("%.4f", currentSpeechProb)

        Log.i("SafeHerAudioPOC", "chunk=$sequenceNumber pPeak=$formattedPeak pRms=$formattedRms floor=$formattedFloor class=$currentClassification speechProb=$formattedProb speech=$isSpeechDetected loudDecay=$loudDecayCount speechEnter=$speechEnterCount speechExit=$speechExitCount")

        val params = Arguments.createMap()
        params.putInt("sequenceNumber", sequenceNumber)
        params.putInt("sampleCount", chunk.size)
        // Keep peakAmplitude and rms just for legacy compatibility with React Native components
        params.putInt("peakAmplitude", peak)
        params.putDouble("rms", normalizedRms)
        params.putDouble("timestamp", System.currentTimeMillis().toDouble())

        // Add new POC 3A metadata
        params.putDouble("noiseFloor", noiseFloor)
        params.putString("classification", currentClassification)
        params.putInt("calibrationProgress", calibrationProgress)

        // Add POC 3B VAD metadata
        params.putDouble("speechProbability", currentSpeechProb)
        params.putBoolean("speechDetected", isSpeechDetected)

        reactContext?.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            ?.emit("onAudioMetrics", params)
    }

    private fun cleanupHardware() {
        val record = audioRecord
        if (record != null) {
            record.release()
            Log.i("SafeHerMicService", "AUDIORECORD_RELEASED")
            audioRecord = null
        }
        recordingThread = null

        try {
            vadWorkerThread?.interrupt()
            vadWorkerThread?.join(500)
            vadWorkerThread = null
            vadQueue?.clear()
            vadQueue = null
            resetSpeechSegmentCollector("SERVICE_CLEANUP")
            vadEngineRequiresReset.set(false)

            vadEngine?.close()
            vadEngine = null
        } catch (e: Exception) {
            Log.e("SafeHerMicService", "VAD Cleanup Error", e)
        }

        try {
            isAsrWorkerRunning = false
            asrWorkerThread?.interrupt()
            asrWorkerThread?.join(1000)
            asrWorkerThread = null
            asrQueue?.clear()
            asrQueue = null
        } catch (e: Exception) {
            Log.e("SafeHerMicService", "ASR Cleanup Error", e)
        }
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

    private fun vadWorkerLoop() {
        while (isCapturing) {
            try {
                val queue = vadQueue ?: break
                val frame = queue.poll(100, TimeUnit.MILLISECONDS)
                if (frame != null) {
                    if (vadEngineRequiresReset.getAndSet(false)) {
                        vadEngine?.resetState()
                        resetSpeechSegmentCollector("VAD_CONTINUITY_RESET")
                    }
                    val prob = vadEngine?.processChunkFast(frame) ?: 0.0
                    currentSpeechProb = prob

                    updateSpeechPreRoll(frame)

                    var segmentStartedThisFrame = false
                    var segmentEndPendingStartedThisFrame = false

                    if (!isSpeechDetected) {
                        if (currentSpeechProb >= SPEECH_ENTER_THRESHOLD) {
                            speechEnterCount++
                        } else {
                            speechEnterCount = 0
                        }
                        if (speechEnterCount >= SPEECH_ENTER_FRAMES) {
                            isSpeechDetected = true
                            speechEnterCount = 0
                            speechExitCount = 0

                            if (isCollectingSpeechSegment && isSpeechEndPending) {
                                cancelSpeechEndHangover()
                            } else {
                                startSpeechSegment()
                                segmentStartedThisFrame = true
                            }
                        }
                    } else {
                        if (currentSpeechProb <= SPEECH_EXIT_THRESHOLD) {
                            speechExitCount++
                        } else {
                            speechExitCount = 0
                        }
                        if (speechExitCount >= SPEECH_EXIT_FRAMES) {
                            isSpeechDetected = false
                            speechEnterCount = 0
                            speechExitCount = 0

                            if (isCollectingSpeechSegment) {
                                beginSpeechEndHangover()
                                segmentEndPendingStartedThisFrame = true
                            }
                        }
                    }

                    if (isCollectingSpeechSegment && !segmentStartedThisFrame) {
                        appendActiveSpeechFrameIfWithinLimit(frame)
                    }

                    if (
                        isCollectingSpeechSegment &&
                        isSpeechEndPending &&
                        !segmentEndPendingStartedThisFrame
                    ) {
                        advanceSpeechEndHangover()
                    }
                }
            } catch (e: InterruptedException) {
                Thread.currentThread().interrupt()
                break
            } catch (e: Exception) {
                Log.e("SafeHerMicService", "VAD Worker Exception", e)
            }
        }
    }

    private fun updateSpeechPreRoll(frame: ShortArray) {
        speechPreRollFrames.addLast(frame.clone())
        while (speechPreRollFrames.size > speechPreRollFrameLimit) {
            speechPreRollFrames.removeFirst()
        }
    }

    private fun activeSpeechSegmentSampleCount(): Int {
        return activeSpeechSegmentFrames.sumOf { it.size }
    }

    private fun appendActiveSpeechFrameIfWithinLimit(frame: ShortArray) {
        val currentSamples = activeSpeechSegmentSampleCount()

        if (currentSamples + frame.size > speechMaxSegmentSamples) {
            isCollectingSpeechSegment = false

            Log.i(
                "SafeHerSpeechSegment",
                "SPEECH_SEGMENT_MAX_REACHED samples=$currentSamples"
            )
            return
        }

        activeSpeechSegmentFrames.add(frame.clone())
    }

    private fun beginSpeechEndHangover() {
        isSpeechEndPending = true
        speechEndHangoverFrameCount = 0

        Log.i(
            "SafeHerSpeechSegment",
            "SPEECH_SEGMENT_END_PENDING hangoverFrames=$speechEndHangoverFrameLimit"
        )
    }

    private fun cancelSpeechEndHangover() {
        isSpeechEndPending = false
        speechEndHangoverFrameCount = 0

        Log.i(
            "SafeHerSpeechSegment",
            "SPEECH_SEGMENT_END_CANCELLED"
        )
    }

    private fun advanceSpeechEndHangover() {
        if (!isSpeechEndPending || !isCollectingSpeechSegment) {
            return
        }

        speechEndHangoverFrameCount++

        if (speechEndHangoverFrameCount >= speechEndHangoverFrameLimit) {
            isSpeechEndPending = false
            speechEndHangoverFrameCount = 0
            finalizeSpeechSegment()
        }
    }

    private fun finalizeSpeechSegment() {
        isSpeechEndPending = false
        speechEndHangoverFrameCount = 0
        val sampleCount = activeSpeechSegmentSampleCount()
        val durationMs = (sampleCount.toLong() * 1000L) / SAMPLE_RATE

        isCollectingSpeechSegment = false

        if (sampleCount < speechMinSegmentSamples) {
            Log.i(
                "SafeHerSpeechSegment",
                "SPEECH_SEGMENT_DROPPED_TOO_SHORT samples=$sampleCount durationMs=$durationMs"
            )
            activeSpeechSegmentFrames.clear()
            speechSegmentStartTimeMs = 0L
            return
        }

        Log.i(
            "SafeHerSpeechSegment",
            "SPEECH_SEGMENT_FINALIZED samples=$sampleCount durationMs=$durationMs frames=${activeSpeechSegmentFrames.size}"
        )

        // --- NEW ASR INTEGRATION ---
        val segmentId = nextSegmentId++
        val floatSamples = FloatArray(sampleCount)
        var offset = 0
        for (chunk in activeSpeechSegmentFrames) {
            for (i in chunk.indices) {
                floatSamples[offset++] = chunk[i].toFloat() / 32768.0f
            }
        }
        
        val finalizedAtMs = android.os.SystemClock.elapsedRealtime()
        val audioDurationMs = sampleCount * 1000.0 / 16000.0
        
        Log.i("SafeHerLiveASR", "LIVE_ASR_PCM_CONVERTED id=$segmentId chunks=${activeSpeechSegmentFrames.size} samples=$sampleCount")
        Log.i("SafeHerLiveASR", "LIVE_ASR_SEGMENT_FINALIZED id=$segmentId samples=$sampleCount audioDurationMs=$audioDurationMs")
        
        val queue = asrQueue
        if (queue != null) {
            val segment = AsrSegment(segmentId, floatSamples, finalizedAtMs, audioDurationMs)
            val queueDepthBefore = queue.size
            if (queue.offer(segment)) {
                val queueDepthAfter = queue.size
                Log.i("SafeHerLiveASR", "LIVE_ASR_SEGMENT_SUBMITTED id=$segmentId samples=$sampleCount queueDepthBefore=$queueDepthBefore queueDepthAfter=$queueDepthAfter")
            } else {
                Log.w("SafeHerLiveASR", "LIVE_ASR_SEGMENT_DROPPED id=$segmentId reason=\"queue_full\"")
            }
        }
        // ---------------------------

        speechSegmentStartTimeMs = 0L
    }

    private fun resetSpeechSegmentCollector(reason: String) {
        val hadState =
            speechPreRollFrames.isNotEmpty() ||
            activeSpeechSegmentFrames.isNotEmpty() ||
            isCollectingSpeechSegment ||
            speechSegmentStartTimeMs != 0L ||
            isSpeechEndPending ||
            speechEndHangoverFrameCount != 0

        speechPreRollFrames.clear()
        activeSpeechSegmentFrames.clear()
        isCollectingSpeechSegment = false
        speechSegmentStartTimeMs = 0L
        isSpeechEndPending = false
        speechEndHangoverFrameCount = 0

        if (hadState) {
            Log.i(
                "SafeHerSpeechSegment",
                "SPEECH_SEGMENT_COLLECTOR_RESET reason=$reason"
            )
        }
    }

    private fun startSpeechSegment() {
        isSpeechEndPending = false
        speechEndHangoverFrameCount = 0
        activeSpeechSegmentFrames.clear()

        for (preRollFrame in speechPreRollFrames) {
            activeSpeechSegmentFrames.add(preRollFrame.clone())
        }

        isCollectingSpeechSegment = true
        speechSegmentStartTimeMs = System.currentTimeMillis()

        Log.i(
            "SafeHerSpeechSegment",
            "SPEECH_SEGMENT_STARTED preRollFrames=${activeSpeechSegmentFrames.size}"
        )
    }

    private fun emitState(state: String) {
        val params = Arguments.createMap()
        params.putString("state", state)
        reactContext?.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            ?.emit("onVoiceMonitoringState", params)
    }

    private fun asrWorkerLoop() {
        Log.i("SafeHerLiveASR", "LIVE_ASR_ENGINE_INIT_STARTED")
        
        val destFile = java.io.File(filesDir, "ggml-tiny.en-q5_1.bin")
        if (!destFile.exists()) {
            try {
                assets.open("models/ggml-tiny.en-q5_1.bin").use { input ->
                    java.io.FileOutputStream(destFile).use { output ->
                        input.copyTo(output)
                    }
                }
            } catch (e: Exception) {
                Log.e("SafeHerLiveASR", "LIVE_ASR_ENGINE_INIT_FAILED error=\"Failed to copy model\"")
            }
        }

        asrEngine = SafeHerOfflineAsrEngine()
        val isReady = asrEngine?.initModel(destFile.absolutePath) ?: false
        if (isReady) {
            Log.i("SafeHerLiveASR", "LIVE_ASR_ENGINE_INIT_READY")
        } else {
            Log.e("SafeHerLiveASR", "LIVE_ASR_ENGINE_INIT_FAILED error=\"Model initialization failed\"")
        }

        while (isAsrWorkerRunning) {
            try {
                val queue = asrQueue ?: break
                val segment = queue.poll(100, TimeUnit.MILLISECONDS)
                if (segment != null) {
                    val startedAtMs = android.os.SystemClock.elapsedRealtime()
                    val queueWaitMs = startedAtMs - segment.finalizedAtMs
                    
                    if (!isReady) {
                        Log.e("SafeHerLiveASR", "LIVE_ASR_SEGMENT_FAILED id=${segment.id} error=\"Engine not ready\"")
                        continue
                    }
                    
                    Log.i("SafeHerLiveASR", "LIVE_ASR_SEGMENT_STARTED id=${segment.id} samples=${segment.samples.size} queueWaitMs=$queueWaitMs audioDurationMs=${segment.audioDurationMs}")
                    
                    Log.i("SafeHerLiveASR", "LIVE_ASR_NATIVE_CALL_STARTED id=${segment.id}")
                    val nativeCallStartedAtMs = android.os.SystemClock.elapsedRealtime()
                    val rawTranscript = asrEngine?.transcribe(segment.samples) ?: ""
                    val nativeCallFinishedAtMs = android.os.SystemClock.elapsedRealtime()
                    
                    val nativeCallMs = nativeCallFinishedAtMs - nativeCallStartedAtMs
                    Log.i("SafeHerLiveASR", "LIVE_ASR_NATIVE_CALL_FINISHED id=${segment.id} nativeCallMs=$nativeCallMs")
                    
                    val totalSinceFinalizeMs = nativeCallFinishedAtMs - segment.finalizedAtMs
                    val realTimeFactor = if (segment.audioDurationMs > 0) {
                        nativeCallMs.toDouble() / segment.audioDurationMs
                    } else 0.0
                    
                    if (rawTranscript.isBlank()) {
                        Log.i("SafeHerLiveASR", "LIVE_ASR_SEGMENT_EMPTY id=${segment.id} queueWaitMs=$queueWaitMs nativeCallMs=$nativeCallMs totalSinceFinalizeMs=$totalSinceFinalizeMs audioDurationMs=${segment.audioDurationMs} realTimeFactor=$realTimeFactor")
                    } else {
                        val escapedText = rawTranscript.replace("\"", "\\\"").replace("\n", "\\n")
                        Log.i("SafeHerLiveASR", "LIVE_ASR_SEGMENT_RESULT id=${segment.id} text=\"$escapedText\" queueWaitMs=$queueWaitMs nativeCallMs=$nativeCallMs totalSinceFinalizeMs=$totalSinceFinalizeMs audioDurationMs=${segment.audioDurationMs} realTimeFactor=$realTimeFactor")
                    }

                    // --- DIAGNOSTIC CLASSIFICATION ---
                    val trimmed = rawTranscript.trim()
                    val category: String
                    var diagnosticCleaned = trimmed
                    
                    if (trimmed.isEmpty()) {
                        category = "EMPTY"
                    } else if (trimmed.equals("[BLANK_AUDIO]", ignoreCase = true)) {
                        category = "BLANK_AUDIO_MARKER"
                    } else if (trimmed.equals("[Mumbling]", ignoreCase = true)) {
                        category = "MUMBLING_MARKER"
                    } else {
                        // Check if it contains any letters or digits
                        var hasAlphanumeric = false
                        for (c in trimmed) {
                            if (c.isLetterOrDigit()) {
                                hasAlphanumeric = true
                                break
                            }
                        }
                        if (!hasAlphanumeric) {
                            category = "PUNCTUATION_ONLY"
                        } else {
                            category = "CONTENT"
                            // Create diagnosticCleaned
                            diagnosticCleaned = trimmed
                                .replace(Regex("(?i)\\[BLANK_AUDIO\\]"), "")
                                .replace(Regex("(?i)\\[Mumbling\\]"), "")
                                .trim()
                        }
                    }
                    
                    val escapedRaw = rawTranscript.replace("\"", "\\\"").replace("\n", "\\n")
                    val escapedCleaned = diagnosticCleaned.replace("\"", "\\\"").replace("\n", "\\n")
                    Log.i("SafeHerLiveASR", "LIVE_ASR_TRANSCRIPT_CLASSIFIED id=${segment.id} category=$category raw=\"$escapedRaw\" diagnosticCleaned=\"$escapedCleaned\"")
                    
                    if (category == "CONTENT" || category == "PUNCTUATION_ONLY") {
                        SafeHerEmergencyIntentDetector.analyze(segment.id, diagnosticCleaned)
                        // No real SOS triggered. Diagnostic only.
                    }
                    // ---------------------------------
                }
            } catch (e: InterruptedException) {
                Thread.currentThread().interrupt()
                break
            } catch (e: Exception) {
                Log.e("SafeHerLiveASR", "ASR Worker Exception", e)
            }
        }
        
        asrEngine?.close()
        asrEngine = null
        Log.i("SafeHerLiveASR", "LIVE_ASR_ENGINE_SHUTDOWN")
        Log.i("SafeHerLiveASR", "LIVE_ASR_WORKER_STOPPED")
    }
}
