// This service abstracts geocoding. In V1 offline-first, if provider=none, it relies on mock data or current location.
const PROVIDER = process.env.EXPO_PUBLIC_MAPS_PROVIDER || 'none';

export interface PlaceResult {
  id: string;
  name: string;
  description: string;
  latitude: number;
  longitude: number;
}

export const searchPlaces = async (query: string): Promise<PlaceResult[]> => {
  if (PROVIDER === 'none') {
    return [
      { id: 'demo1', name: 'Home', description: 'Saved Place', latitude: 40.7128, longitude: -74.0060 },
      { id: 'demo2', name: 'Work', description: 'Saved Place', latitude: 40.7580, longitude: -73.9855 },
    ];
  }
  
  // TODO: Implement Google Places / Mapbox search here
  return [];
};

export const geocodePlace = async (placeId: string): Promise<{latitude: number, longitude: number} | null> => {
  if (PROVIDER === 'none') {
    if (placeId === 'demo1') return { latitude: 40.7128, longitude: -74.0060 };
    if (placeId === 'demo2') return { latitude: 40.7580, longitude: -73.9855 };
    return null;
  }
  return null;
};

export const reverseGeocode = async (latitude: number, longitude: number): Promise<string> => {
  if (PROVIDER === 'none') {
    return 'Current Location';
  }
  return 'Current Location';
};
