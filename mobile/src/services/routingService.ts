import { RoutingProvider } from './routing/RoutingProvider';
import { OSRMProvider } from './routing/OSRMProvider';

const provider: RoutingProvider = new OSRMProvider();

export const getRoute = async (start: {latitude: number, longitude: number}, destination: {latitude: number, longitude: number}): Promise<{lat: number, lon: number}[] | null> => {
  return provider.getRoute(start, destination);
};
