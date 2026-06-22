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

    // Try to get a cached location first as a quick fallback
    const cachedLocation = await Location.getLastKnownPositionAsync();
    if (cachedLocation) {
      return {
        latitude: cachedLocation.coords.latitude,
        longitude: cachedLocation.coords.longitude,
        mapLink: `https://www.google.com/maps?q=${cachedLocation.coords.latitude},${cachedLocation.coords.longitude}`,
        capturedAt: new Date().toISOString()
      };
    }

    const locationPromise = Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    // 10 second timeout for cold starts
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Location request timed out')), 10000)
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
