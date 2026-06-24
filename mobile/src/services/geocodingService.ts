import { NominatimProvider } from './geocoding/NominatimProvider';
import { PlaceResult, GeocodingProvider } from './geocoding/GeocodingProvider';

const provider: GeocodingProvider = new NominatimProvider();

export { PlaceResult };

export const searchPlaces = async (query: string): Promise<PlaceResult[]> => {
  return provider.searchPlaces(query);
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
