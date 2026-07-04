package com.safeher.app

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.util.Log
import androidx.core.app.ActivityCompat
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Arguments
import com.facebook.react.modules.core.DeviceEventManagerModule

class SafeHerAudioModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String {
        return "SafeHerAudioModule"
    }

    @ReactMethod
    fun startCapture() {
        val applicationContext = reactApplicationContext.applicationContext
        SafeHerMicrophoneService.reactContext = reactApplicationContext

        if (ActivityCompat.checkSelfPermission(applicationContext, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            Log.e("SafeHerAudioModule", "MIC_PERMISSION_DENIED: RECORD_AUDIO is not granted.")
            emitState("MIC_START_FAILED")
            return
        }

        if (!SafeHerAppLifecycle.isActivityResumed) {
            Log.w("SafeHerAudioModule", "ACTIVITY_NOT_RESUMED: Aborting service start.")
            emitState("MIC_START_FAILED")
            return
        }

        val intentGen: Int
        synchronized(SafeHerMicrophoneService.stateLock) {
            val newGen = SafeHerMicrophoneService.tracker.generation + 1
            SafeHerMicrophoneService.tracker = SafeHerMicrophoneService.ServiceStateTracker(
                SafeHerMicrophoneService.ServiceState.START_REQUESTED,
                newGen
            )
            intentGen = newGen
        }

        Log.i("SafeHerAudioModule", "Issuing SERVICE_START_REQUESTED generation $intentGen")
        val intent = Intent(applicationContext, SafeHerMicrophoneService::class.java).apply {
            action = SafeHerMicrophoneService.ACTION_START
            putExtra("generation", intentGen)
        }
        
        try {
            applicationContext.startForegroundService(intent)
        } catch (e: Exception) {
            synchronized(SafeHerMicrophoneService.stateLock) {
                val current = SafeHerMicrophoneService.tracker
                if (current.generation == intentGen) {
                    SafeHerMicrophoneService.tracker = current.copy(state = SafeHerMicrophoneService.ServiceState.IDLE)
                }
            }
            Log.e("SafeHerAudioModule", "startForegroundService exception", e)
            emitState("MIC_START_FAILED")
        }
    }

    @ReactMethod
    fun stopCapture() {
        val intentGen: Int
        synchronized(SafeHerMicrophoneService.stateLock) {
            val current = SafeHerMicrophoneService.tracker
            if (current.state == SafeHerMicrophoneService.ServiceState.IDLE) {
                Log.i("SafeHerAudioModule", "IDLE, skipping STOP intent to avoid ghost service")
                return
            }
            SafeHerMicrophoneService.tracker = current.copy(state = SafeHerMicrophoneService.ServiceState.STOP_REQUESTED)
            intentGen = current.generation
        }

        Log.i("SafeHerAudioModule", "Issuing STOP_REQUESTED generation $intentGen")
        val applicationContext = reactApplicationContext.applicationContext
        val intent = Intent(applicationContext, SafeHerMicrophoneService::class.java).apply {
            action = SafeHerMicrophoneService.ACTION_STOP
            putExtra("generation", intentGen)
        }
        try {
            applicationContext.startService(intent)
        } catch (e: Exception) {
            Log.e("SafeHerAudioModule", "stopCapture exception", e)
        }
    }

    private fun emitState(state: String) {
        val params = Arguments.createMap()
        params.putString("state", state)
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("onVoiceMonitoringState", params)
    }

    // Required for React Native 0.81 NativeEventEmitter compatibility to silence warnings
    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}
}
