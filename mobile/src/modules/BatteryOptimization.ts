import { Platform } from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';

export const checkIsExempt = async (): Promise<boolean> => {
  if (Platform.OS !== 'android') return true;
  // Without the custom native module, we don't have a direct synchronous check.
  // We return false to allow the UI to prompt the user to verify their settings.
  return false;
};

export const requestExemption = async (): Promise<boolean> => {
  if (Platform.OS !== 'android') return true;
  try {
    await IntentLauncher.startActivityAsync('android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS');
    return true;
  } catch (error) {
    console.warn("Could not open battery optimization settings", error);
    return false;
  }
};
