import { NativeModules, NativeEventEmitter, PermissionsAndroid, Platform } from 'react-native';

const { LocationSharingModule } = NativeModules;

export const locationSharingEmitter = LocationSharingModule
  ? new NativeEventEmitter(LocationSharingModule)
  : ({
      addListener: () => ({ remove: () => {} }),
      removeAllListeners: () => {}
    } as any);

const checkNativeModule = () => {
  if (!LocationSharingModule) {
    throw new Error("LocationSharingModule native module is not available. Ensure it is linked and registered in MainApplication.kt.");
  }
};

export const startLocationSharing = async (token: string, apiUrl: string, userId: string): Promise<void> => {
  checkNativeModule();
  if (Platform.OS === 'android') {
    if (Platform.Version >= 33) {
      await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    }
  }
  return LocationSharingModule.startLocationSharing(token, apiUrl, userId);
};

export const stopLocationSharing = async (): Promise<void> => {
  checkNativeModule();
  return LocationSharingModule.stopLocationSharing();
};

export const startSafeWindowLocation = async (token: string, apiUrl: string, userId: string): Promise<void> => {
  checkNativeModule();
  return LocationSharingModule.startSafeWindowLocation(token, apiUrl, userId);
};

export const stopSafeWindowLocation = async (): Promise<void> => {
  checkNativeModule();
  return LocationSharingModule.stopSafeWindowLocation();
};

export const updateLocationToken = async (newToken: string): Promise<void> => {
  checkNativeModule();
  return LocationSharingModule.updateToken(newToken);
};

export interface LocationSharingStatus {
  preferenceEnabled: boolean;
  serviceRunning: boolean;
  storedUserId: string | null;
}

export const getLocationSharingStatus = async (): Promise<LocationSharingStatus> => {
  checkNativeModule();
  return LocationSharingModule.getLocationSharingStatus();
};
