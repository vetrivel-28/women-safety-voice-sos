import * as Location from 'expo-location';

export async function getCurrentLocationForAlert(fastMode?: boolean): Promise<{
  latitude: number;
  longitude: number;
  accuracy: number;
  captured_at: string;
  provider: string;
  permissionDenied: boolean;
  mapLink: string;
} | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    
    if (status !== 'granted') {
      return {
        latitude: 0,
        longitude: 0,
        accuracy: 9999,
        captured_at: new Date().toISOString(),
        provider: "expo-location",
        permissionDenied: true,
        mapLink: ''
      };
    }

    let bestLocation: Location.LocationObject | null = null;
    const startTime = Date.now();
    const timeout = fastMode ? 2000 : 8000; // 2 seconds fast, 8 seconds normal

    while (Date.now() - startTime < timeout) {
      try {
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Location request timed out')), fastMode ? 1000 : 3000)
        );
        const locationPromise = Location.getCurrentPositionAsync({
          accuracy: fastMode ? Location.Accuracy.Balanced : Location.Accuracy.Highest,
        });

        const location = await Promise.race([locationPromise, timeoutPromise]) as Location.LocationObject;

        if (!bestLocation || (location.coords.accuracy !== null && bestLocation.coords.accuracy !== null && location.coords.accuracy < bestLocation.coords.accuracy)) {
          bestLocation = location;
        }

        if (bestLocation.coords.accuracy !== null && bestLocation.coords.accuracy <= (fastMode ? 100 : 50)) {
          break; // Found a good enough sample
        }
      } catch (e) {
        // Ignore single sample errors and continue loop
      }
      
      // Small delay before next sample
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    if (!bestLocation) {
      // Fallback to last known if we couldn't get any
      bestLocation = await Location.getLastKnownPositionAsync();
    }

    if (!bestLocation) {
      return null;
    }

    return {
      latitude: bestLocation.coords.latitude,
      longitude: bestLocation.coords.longitude,
      accuracy: bestLocation.coords.accuracy || 9999,
      captured_at: new Date().toISOString(),
      provider: "expo-location",
      permissionDenied: false,
      mapLink: `https://www.google.com/maps?q=${bestLocation.coords.latitude},${bestLocation.coords.longitude}`
    };
  } catch (error) {
    return null;
  }
}
