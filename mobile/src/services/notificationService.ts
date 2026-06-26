import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

if (Platform.OS === 'android') {
  Notifications.setNotificationChannelAsync('default', {
    name: 'default',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#FF231F7C',
  });
}

// NOTE: In Expo SDK 53+, remote push notifications are not supported in Expo Go.
// This service strictly uses local notifications to avoid the push token error.
export const requestNotificationPermissions = async () => {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    return finalStatus === 'granted';
  } catch (error) {
    // Suppress console errors related to push functionality in Expo Go
    console.warn("Local notifications permission check gracefully failed (likely Expo Go SDK 53 limitation).", error);
    return false;
  }
};

export const scheduleLocalNotification = async (title: string, body: string, triggerSeconds: number): Promise<string> => {
  const identifier = await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: triggerSeconds,
      repeats: false,
    },
  });
  return identifier;
};

export const cancelLocalNotification = async (identifier: string) => {
  await Notifications.cancelScheduledNotificationAsync(identifier);
};

export const cancelAllLocalNotifications = async () => {
  await Notifications.cancelAllScheduledNotificationsAsync();
};
