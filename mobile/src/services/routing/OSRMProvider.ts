import { RoutingProvider } from './RoutingProvider';

export class OSRMProvider implements RoutingProvider {
  async getRoute(start: {latitude: number, longitude: number}, destination: {latitude: number, longitude: number}): Promise<{lat: number, lon: number}[] | null> {
    try {
      // DEVELOPMENT FALLBACK: OSRM public API (router.project-osrm.org).
      // This is for development only and lacks a production SLA. 
      // For production, a dedicated routing provider (like Mapbox Directions, Valhalla, or self-hosted OSRM) 
      // should be implemented as a new RoutingProvider class.
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
