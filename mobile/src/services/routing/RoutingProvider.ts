export interface RouteResult {
  coordinates: { lat: number, lon: number }[];
  distanceMeters?: number;
  durationSeconds?: number;
}

export interface RoutingProvider {
  getRoute(start: {latitude: number, longitude: number}, destination: {latitude: number, longitude: number}): Promise<{lat: number, lon: number}[] | null>;
}
