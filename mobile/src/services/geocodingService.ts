import { GooglePlacesProvider } from './geocoding/GooglePlacesProvider';
import { PlaceResult, GeocodingProvider } from './geocoding/GeocodingProvider';

import { NominatimProvider } from './geocoding/NominatimProvider';

const googleApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
const provider: GeocodingProvider = googleApiKey 
  ? new GooglePlacesProvider() 
  : new NominatimProvider();

export const isUsingNominatim = !googleApiKey;

export { PlaceResult };

export const searchPlaces = async (query: string, currentLoc?: {latitude: number, longitude: number}): Promise<PlaceResult[]> => {
  return provider.searchPlaces(query, currentLoc);
};

export const geocodePlace = async (placeId: string): Promise<{latitude: number, longitude: number} | null> => {
  return provider.geocodePlace(placeId);
};

export const reverseGeocode = async (latitude: number, longitude: number): Promise<string> => {
  return provider.reverseGeocode(latitude, longitude);
};

export const getRoute = async (start: {latitude: number, longitude: number}, destination: {latitude: number, longitude: number}): Promise<{lat: number, lon: number}[] | null> => {
  return provider.getRoute(start, destination);
};

