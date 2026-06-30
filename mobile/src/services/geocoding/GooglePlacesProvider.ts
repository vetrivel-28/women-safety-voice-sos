import { GeocodingProvider, PlaceResult } from './GeocodingProvider';
import { NominatimProvider } from './NominatimProvider';

export class GooglePlacesProvider implements GeocodingProvider {
  private fallbackProvider = new NominatimProvider();
  private sessionToken = Math.random().toString(36).substring(2, 15);

  private generateNewSessionToken() {
    this.sessionToken = Math.random().toString(36).substring(2, 15);
  }

  private getApiKey(): string {
    const key = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!key) {
      throw new Error("Google Maps API key not configured");
    }
    return key;
  }

  async searchPlaces(query: string): Promise<PlaceResult[]> {
    try {
      const apiKey = this.getApiKey();
      const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(query)}&sessiontoken=${this.sessionToken}&key=${apiKey}`;
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.status === 'REQUEST_DENIED') {
        throw new Error("Google Maps API key not configured");
      }
      
      if (data && data.predictions) {
        return data.predictions.map((item: any) => ({
          id: item.place_id,
          name: item.structured_formatting?.main_text || item.description,
          description: item.description,
        }));
      }
      return [];
    } catch (e: any) {
      if (e.message === "Google Maps API key not configured") {
        throw e;
      }
      console.warn("Google Places autocomplete failed, falling back", e);
      return this.fallbackProvider.searchPlaces(query);
    }
  }

  async geocodePlace(placeId: string): Promise<{latitude: number, longitude: number} | null> {
    try {
      const apiKey = this.getApiKey();
      const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=geometry&sessiontoken=${this.sessionToken}&key=${apiKey}`;
      const response = await fetch(url);
      const data = await response.json();
      
      this.generateNewSessionToken();
      
      if (data.status === 'REQUEST_DENIED') {
        throw new Error("Google Maps API key not configured");
      }
      
      if (data && data.result && data.result.geometry && data.result.geometry.location) {
        return {
          latitude: data.result.geometry.location.lat,
          longitude: data.result.geometry.location.lng
        };
      }
      return null;
    } catch (e: any) {
      if (e.message === "Google Maps API key not configured") {
        throw e;
      }
      console.warn("Google Places details failed, falling back", e);
      return this.fallbackProvider.geocodePlace(placeId);
    }
  }

  async reverseGeocode(latitude: number, longitude: number): Promise<string> {
    return this.fallbackProvider.reverseGeocode(latitude, longitude);
  }

  async getRoute(start: {latitude: number, longitude: number}, destination: {latitude: number, longitude: number}): Promise<{lat: number, lon: number}[] | null> {
    return this.fallbackProvider.getRoute(start, destination);
  }
}
