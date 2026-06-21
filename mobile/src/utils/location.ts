import * as Location from 'expo-location';

export async function getCurrentLocationForAlert(): Promise<{
  latitude: number;
  longitude: number;
  mapLink: string;
  capturedAt: string;
  permissionDenied?: boolean;
} | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    
    if (status !== 'granted') {
      return {
        latitude: 0,
        longitude: 0,
        mapLink: '',
        capturedAt: new Date().toISOString(),
        permissionDenied: true
      };
    }

    const locationPromise = Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    // 4 second timeout
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Location request timed out')), 4000)
    );

    const location = await Promise.race([locationPromise, timeoutPromise]) as Location.LocationObject;

    return {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      mapLink: `https://www.google.com/maps?q=${location.coords.latitude},${location.coords.longitude}`,
      capturedAt: new Date().toISOString()
    };
  } catch (error) {
    // If anything fails (timeout, GPS disabled, etc.), return null
    return null;
  }
}
