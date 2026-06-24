import { GeocodingProvider, PlaceResult } from './GeocodingProvider';

export class NominatimProvider implements GeocodingProvider {
  async searchPlaces(query: string): Promise<PlaceResult[]> {
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&countrycodes=in`, {
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
        longitude: parseFloat(item.lon)
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

  async getRoute(start: {latitude: number, longitude: number}, destination: {latitude: number, longitude: number}): Promise<{lat: number, lon: number}[] | null> {
    try {
      // OSRM routing profile: driving
      const url = `https://router.project-osrm.org/route/v1/driving/${start.longitude},${start.latitude};${destination.longitude},${destination.latitude}?overview=full&geometries=geojson`;
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        const coordinates = route.geometry.coordinates; // Array of [lon, lat]
        return coordinates.map((coord: number[]) => ({
          lat: coord[1],
          lon: coord[0]
        }));
      }
      return null;
    } catch (e) {
      console.warn("OSRM getRoute failed", e);
      return null;
    }
  }
}
