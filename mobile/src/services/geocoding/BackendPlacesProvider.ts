import { GeocodingProvider, PlaceResult } from './GeocodingProvider';
import { apiClient } from '../../api/client';
import { NominatimProvider } from './NominatimProvider';

export class BackendPlacesProvider implements GeocodingProvider {
  private fallbackProvider = new NominatimProvider();
  private sessionToken = Math.random().toString(36).substring(2, 15);

  private generateNewSessionToken() {
    this.sessionToken = Math.random().toString(36).substring(2, 15);
  }

  async searchPlaces(query: string): Promise<PlaceResult[]> {
    try {
      const response = await apiClient.get('/api/places/autocomplete', {
        params: { input: query, sessiontoken: this.sessionToken }
      });
      
      const data = response.data;
      if (data && data.predictions) {
        return data.predictions.map((item: any) => ({
          id: item.place_id,
          name: item.structured_formatting?.main_text || item.description,
          description: item.description,
          // We don't have lat/lng yet from autocomplete
        }));
      }
      return [];
    } catch (e: any) {
      if (e?.response?.status === 500 && e.response.data?.detail === "Google Maps API key not configured") {
        throw new Error("Google Maps API key not configured");
      }
      console.warn("Backend Places autocomplete failed, falling back", e?.response?.data || e.message);
      return this.fallbackProvider.searchPlaces(query);
    }
  }

  async geocodePlace(placeId: string): Promise<{latitude: number, longitude: number} | null> {
    try {
      // Try backend first
      const response = await apiClient.get('/api/places/details', {
        params: { place_id: placeId, sessiontoken: this.sessionToken }
      });
      const data = response.data;
      
      // We completed a search session, regenerate token for next time
      this.generateNewSessionToken();
      
      if (data && data.latitude && data.longitude) {
        return {
          latitude: data.latitude,
          longitude: data.longitude
        };
      }
      return null;
    } catch (e: any) {
      console.warn("Backend Places details failed, falling back", e?.response?.data || e.message);
      return this.fallbackProvider.geocodePlace(placeId);
    }
  }

  async reverseGeocode(latitude: number, longitude: number): Promise<string> {
    // Keep using fallback/nominatim for reverse geocoding to save on Google Places API costs
    // since the spec only requested Google Places for location selection.
    return this.fallbackProvider.reverseGeocode(latitude, longitude);
  }

  async getRoute(start: {latitude: number, longitude: number}, destination: {latitude: number, longitude: number}): Promise<{lat: number, lon: number}[] | null> {
    // Continue using OSRM for routing
    return this.fallbackProvider.getRoute(start, destination);
  }
}
