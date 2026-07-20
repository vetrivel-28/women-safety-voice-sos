import { GeocodingProvider, PlaceResult } from './GeocodingProvider';

export class NominatimProvider implements GeocodingProvider {
  async searchPlaces(query: string, currentLoc?: {latitude: number, longitude: number}): Promise<PlaceResult[]> {
    try {
      // Search all of India with optional proximity bias
      const biasParam = currentLoc
        ? `&lat=${currentLoc.latitude}&lon=${currentLoc.longitude}`
        : '';
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=7&addressdetails=1&countrycodes=in${biasParam}`;
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'SafeHer/1.0 (Mobile App)'
        }
      });
      const data = await response.json();
      if (!Array.isArray(data)) return [];
      
      return data.map((item: any) => ({
        id: item.place_id ? item.place_id.toString() : Math.random().toString(),
        name: item.name || (item.display_name ? item.display_name.split(',')[0] : 'Unknown'),
        description: item.display_name || '',
        latitude: parseFloat(item.lat),
        longitude: parseFloat(item.lon),
        provider: 'openstreetmap'
      }));
    } catch (e) {
      console.warn("Nominatim searchPlaces failed", e);
      return [];
    }
  }

  async geocodePlace(placeId: string): Promise<{latitude: number, longitude: number} | null> {
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/details?place_id=${placeId}&format=json`, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'SafeHer/1.0 (Mobile App)'
        }
      });
      const data = await response.json();
      if (data && data.centroid && data.centroid.coordinates) {
        return {
          latitude: data.centroid.coordinates[1],
          longitude: data.centroid.coordinates[0]
        };
      }
      return null;
    } catch (e) {
      console.warn("Nominatim geocodePlace failed", e);
      return null;
    }
  }

  async reverseGeocode(latitude: number, longitude: number): Promise<string> {
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'SafeHer/1.0 (Mobile App)'
        }
      });
      const data = await response.json();
      return data.display_name || 'Current Location';
    } catch (e) {
      console.warn("Nominatim reverseGeocode failed", e);
      return 'Current Location';
    }
  }
}
