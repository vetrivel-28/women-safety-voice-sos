import { GooglePlacesProvider } from './geocoding/GooglePlacesProvider';
import { PlaceResult, GeocodingProvider } from './geocoding/GeocodingProvider';
import { NominatimProvider } from './geocoding/NominatimProvider';
import { MapTilerProvider } from './geocoding/MapTilerProvider';

const googleApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
const mapTilerApiKey = process.env.EXPO_PUBLIC_MAPTILER_API_KEY;

const provider: GeocodingProvider = mapTilerApiKey
  ? new MapTilerProvider(mapTilerApiKey)
  : googleApiKey 
    ? new GooglePlacesProvider() 
    : new NominatimProvider();

export const isUsingNominatim = !googleApiKey && !mapTilerApiKey;

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

