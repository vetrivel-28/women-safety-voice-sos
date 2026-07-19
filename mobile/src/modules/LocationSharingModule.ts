import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabaseClient';

class SimpleEventEmitter {
  private listeners: Record<string, Function[]> = {};
  
  addListener(event: string, callback: Function) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
    return {
      remove: () => {
        this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
      }
    };
  }
  
  emit(event: string, ...args: any[]) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(cb => cb(...args));
    }
  }
}

export const locationSharingEmitter = new SimpleEventEmitter();

export const BACKGROUND_LOCATION_TASK = 'BACKGROUND_LOCATION_TASK';

TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }: any) => {
  if (error) {
    console.error('[TaskManager] Background location error', error);
    return;
  }
  if (data) {
    const { locations } = data;
    if (locations && locations.length > 0) {
      const loc = locations[locations.length - 1];
      
      // Emit flat payload to foreground JS context
      const payloadStr = JSON.stringify({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        accuracy: loc.coords.accuracy,
        speed: loc.coords.speed,
        heading: loc.coords.heading,
        timestamp: loc.timestamp
      });
      locationSharingEmitter.emit('onLocationUpdated', payloadStr);
      
      // Headless sync when app is backgrounded/killed
      try {
        const stateStr = await AsyncStorage.getItem('@location_sharing_state');
        if (stateStr) {
          const state = JSON.parse(stateStr);
          const timestamp = new Date(loc.timestamp).toISOString();
          
          if (state.type === 'safe_window' && state.journeyId) {
            await supabase.from('journey_location_updates').insert({
              journey_id: state.journeyId,
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
              accuracy: loc.coords.accuracy,
              captured_at: timestamp,
              provider: 'expo-location'
            });
            await supabase.from('safe_windows').update({
              current_latitude: loc.coords.latitude,
              current_longitude: loc.coords.longitude,
              last_location_at: timestamp
            }).eq('id', state.journeyId);
          } else if (state.type === 'family' && state.userId) {
            await supabase.from('family_member_locations').upsert({
              user_id: state.userId,
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
              accuracy: loc.coords.accuracy,
              updated_at: timestamp
            }, { onConflict: 'user_id' });
          }
        }
      } catch (e) {
        console.warn('[TaskManager] Background sync failed', e);
      }
    }
  }
});

/**
 * Request POST_NOTIFICATIONS permission on Android 13+.
 * Silent no-op on earlier Android versions.
 */
const requestNotificationPermission = async (): Promise<void> => {
  if (Platform.OS !== 'android') return;
  try {
    // API level 33+ = Android 13+. expo-notifications handles this gracefully.
    const { status: existingStatus } = await import('expo-notifications')
      .then(m => m.getPermissionsAsync());
    if (existingStatus !== 'granted') {
      const { status } = await import('expo-notifications')
        .then(m => m.requestPermissionsAsync());
      if (status !== 'granted') {
        console.warn('[LocationSharing] POST_NOTIFICATIONS not granted. Foreground notification may not appear.');
      }
    }
  } catch (e) {
    // expo-notifications may not be available in all environments
    console.warn('[LocationSharing] Could not request notification permission', e);
  }
};

const startLocationTask = async (stateConfig: any) => {
  const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
  if (fgStatus !== 'granted') {
    console.warn('[LocationSharing] Foreground location permission not granted');
    return;
  }
  const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
  if (bgStatus !== 'granted') {
    console.warn('[LocationSharing] Background location permission not granted');
    return;
  }

  // Request notification permission so foreground service notification is visible
  await requestNotificationPermission();

  // Always update AsyncStorage first so the background task picks up the new state
  await AsyncStorage.setItem('@location_sharing_state', JSON.stringify(stateConfig));

  const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
  
  if (isRegistered) {
    // Task is already running. Stop and restart to apply any config changes
    // (e.g. new journeyId for a new journey after a family session).
    try {
      await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    } catch (e) {
      console.warn('[LocationSharing] Failed to stop existing task before restart', e);
    }
  }

  await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
    accuracy: Location.Accuracy.High,
    timeInterval: 5000,   // 5s — balanced battery/accuracy
    distanceInterval: 5,  // 5m minimum movement
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: "SafeHer — Journey Active",
      notificationBody: "Sharing live location...",
      notificationColor: "#4F46E5",
    }
  });
};

const stopLocationTask = async () => {
  await AsyncStorage.removeItem('@location_sharing_state');
  const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
  if (isRegistered) {
    await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  }
};

// Public API
export const startLocationSharing = async (token: string, apiUrl: string, userId: string): Promise<void> => {
  await startLocationTask({ type: 'family', userId });
};

export const stopLocationSharing = async (): Promise<void> => {
  await stopLocationTask();
};

export const startSafeWindowLocation = async (token: string, apiUrl: string, userId: string, journeyId?: string): Promise<void> => {
  await startLocationTask({ type: 'safe_window', userId, journeyId });
};

export const stopSafeWindowLocation = async (): Promise<void> => {
  await stopLocationTask();
};

export const updateLocationToken = async (newToken: string): Promise<void> => {
  // No-op: we use the Supabase client directly, not bearer tokens
};

export interface LocationSharingStatus {
  preferenceEnabled: boolean;
  serviceRunning: boolean;
  storedUserId: string | null;
}

export const getLocationSharingStatus = async (): Promise<LocationSharingStatus> => {
  const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
  const stateStr = await AsyncStorage.getItem('@location_sharing_state');
  return {
    preferenceEnabled: !!stateStr,
    serviceRunning: isRegistered,
    storedUserId: stateStr ? JSON.parse(stateStr).userId : null
  };
};
