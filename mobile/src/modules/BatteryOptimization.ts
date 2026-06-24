import { NativeModules, Platform } from 'react-native';

const { BatteryOptimization } = NativeModules;

export const checkIsExempt = async (): Promise<boolean> => {
  if (Platform.OS !== 'android') return true;
  if (!BatteryOptimization) return true; // Fallback for Expo Go
  return await BatteryOptimization.checkIsExempt();
};

export const requestExemption = async (): Promise<boolean> => {
  if (Platform.OS !== 'android') return true;
  if (!BatteryOptimization) return true;
  return await BatteryOptimization.requestExemption();
};
