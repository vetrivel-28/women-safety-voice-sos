export interface PlaceResult {
  id: string;
  name: string;
  description: string;
  latitude?: number;
  longitude?: number;
  provider?: string;
  distanceMeters?: number;
}

export interface GeocodingProvider {
  searchPlaces(query: string, currentLoc?: {latitude: number, longitude: number}): Promise<PlaceResult[]>;
  geocodePlace(placeId: string): Promise<{latitude: number, longitude: number} | null>;
  reverseGeocode(latitude: number, longitude: number): Promise<string>;
  getRoute(start: {latitude: number, longitude: number}, destination: {latitude: number, longitude: number}): Promise<{lat: number, lon: number}[] | null>;
}
