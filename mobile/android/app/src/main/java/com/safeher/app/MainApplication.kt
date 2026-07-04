package com.safeher.app

import android.app.Application
import android.content.res.Configuration

import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactPackage
import com.facebook.react.ReactHost
import com.facebook.react.common.ReleaseLevel
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint
import com.facebook.react.defaults.DefaultReactNativeHost

import expo.modules.ApplicationLifecycleDispatcher
import expo.modules.ReactNativeHostWrapper

object SafeHerAppLifecycle {
    @Volatile var isActivityResumed = false
}

class MainApplication : Application(), ReactApplication {

  override val reactNativeHost: ReactNativeHost = ReactNativeHostWrapper(
      this,
      object : DefaultReactNativeHost(this) {
        override fun getPackages(): List<ReactPackage> =
            PackageList(this).packages.apply {
              // Packages that cannot be autolinked yet can be added manually here, for example:
              // add(MyReactNativePackage())
              add(BatteryOptimizationPackage())
              add(SafeHerAudioPackage())
            }

          override fun getJSMainModuleName(): String = ".expo/.virtual-metro-entry"

          override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG

          override val isNewArchEnabled: Boolean = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
      }
  )

  override val reactHost: ReactHost
    get() = ReactNativeHostWrapper.createReactHost(applicationContext, reactNativeHost)

  override fun onCreate() {
    super.onCreate()
    DefaultNewArchitectureEntryPoint.releaseLevel = try {
      ReleaseLevel.valueOf(BuildConfig.REACT_NATIVE_RELEASE_LEVEL.uppercase())
    } catch (e: IllegalArgumentException) {
      ReleaseLevel.STABLE
    }
    loadReactNative(this)
    ApplicationLifecycleDispatcher.onApplicationCreate(this)

    registerActivityLifecycleCallbacks(object : android.app.Application.ActivityLifecycleCallbacks {
      override fun onActivityCreated(activity: android.app.Activity, savedInstanceState: android.os.Bundle?) {}
      override fun onActivityStarted(activity: android.app.Activity) {}
      override fun onActivityResumed(activity: android.app.Activity) {
          SafeHerAppLifecycle.isActivityResumed = true
      }
      override fun onActivityPaused(activity: android.app.Activity) {
          SafeHerAppLifecycle.isActivityResumed = false
      }
      override fun onActivityStopped(activity: android.app.Activity) {}
      override fun onActivitySaveInstanceState(activity: android.app.Activity, outState: android.os.Bundle) {}
      override fun onActivityDestroyed(activity: android.app.Activity) {}
    })
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    ApplicationLifecycleDispatcher.onConfigurationChanged(this, newConfig)
  }
}
