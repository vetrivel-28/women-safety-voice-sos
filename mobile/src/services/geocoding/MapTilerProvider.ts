import { GeocodingProvider, PlaceResult } from './GeocodingProvider';

export class MapTilerProvider implements GeocodingProvider {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async searchPlaces(query: string, currentLoc?: {latitude: number, longitude: number}): Promise<PlaceResult[]> {
    try {
      const bbox = '76.0,8.0,80.4,13.6'; // Rough bounding box for Tamil Nadu (lon, lat)
      let url = `https://api.maptiler.com/geocoding/${encodeURIComponent(query)}.json?key=${this.apiKey}&bbox=${bbox}&limit=5`;
      
      const response = await fetch(url);
      const data = await response.json();
      
      if (!data.features) return [];
      
      return data.features.map((feature: any) => ({
        id: feature.id,
        name: feature.text,
        description: feature.place_name || feature.text,
        latitude: feature.geometry.coordinates[1],
        longitude: feature.geometry.coordinates[0],
        provider: 'maptiler'
      }));
    } catch (e) {
      console.warn("MapTiler searchPlaces failed", e);
      return [];
    }
  }

  async geocodePlace(placeId: string): Promise<{latitude: number, longitude: number} | null> {
    try {
      // With MapTiler, searchPlaces already returns coordinates in features.
      // If we ever need to fetch by ID:
      const url = `https://api.maptiler.com/geocoding/${placeId}.json?key=${this.apiKey}`;
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.features && data.features.length > 0) {
        return {
          latitude: data.features[0].geometry.coordinates[1],
          longitude: data.features[0].geometry.coordinates[0]
        };
      }
      return null;
    } catch (e) {
      console.warn("MapTiler geocodePlace failed", e);
      return null;
    }
  }

  async reverseGeocode(latitude: number, longitude: number): Promise<string> {
    try {
      const url = `https://api.maptiler.com/geocoding/${longitude},${latitude}.json?key=${this.apiKey}`;
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.features && data.features.length > 0) {
        return data.features[0].place_name || data.features[0].text;
      }
      return 'Unnamed location';
    } catch (e) {
      console.warn("MapTiler reverseGeocode failed", e);
      return 'Unnamed location';
    }
  }
}
