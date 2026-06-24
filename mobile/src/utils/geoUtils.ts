export const distanceBetweenPointsMeters = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371e3; // metres
  const p1 = lat1 * Math.PI / 180;
  const p2 = lat2 * Math.PI / 180;
  const dp = (lat2 - lat1) * Math.PI / 180;
  const dl = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(dp / 2) * Math.sin(dp / 2) +
            Math.cos(p1) * Math.cos(p2) *
            Math.sin(dl / 2) * Math.sin(dl / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

export const distancePointToSegmentMeters = (
  p: { lat: number, lon: number },
  v: { lat: number, lon: number },
  w: { lat: number, lon: number }
): number => {
  const deg2rad = Math.PI / 180;
  const R = 6371e3;
  
  // Approximate cartesian projection for small distances
  const cosLat = Math.cos(v.lat * deg2rad);
  const x0 = p.lon * cosLat * deg2rad * R;
  const y0 = p.lat * deg2rad * R;
  const x1 = v.lon * cosLat * deg2rad * R;
  const y1 = v.lat * deg2rad * R;
  const x2 = w.lon * cosLat * deg2rad * R;
  const y2 = w.lat * deg2rad * R;
  
  const length2 = (x2 - x1)**2 + (y2 - y1)**2;
  if (length2 === 0) return distanceBetweenPointsMeters(p.lat, p.lon, v.lat, v.lon);
  
  let t = ((x0 - x1) * (x2 - x1) + (y0 - y1) * (y2 - y1)) / length2;
  t = Math.max(0, Math.min(1, t));
  
  const projX = x1 + t * (x2 - x1);
  const projY = y1 + t * (y2 - y1);
  
  return Math.sqrt((x0 - projX)**2 + (y0 - projY)**2);
};

export const isRouteDeviation = (
  current: { lat: number, lon: number },
  route: { lat: number, lon: number }[],
  thresholdMeters: number = 300
): boolean => {
  if (!route || route.length === 0) return false;
  if (route.length === 1) {
    return distanceBetweenPointsMeters(current.lat, current.lon, route[0].lat, route[0].lon) > thresholdMeters;
  }
  
  // Windowed search: first find the closest route node
  let closestIdx = 0;
  let minNodeDist = Infinity;
  // Use a fast approx distance for finding the window center to save CPU
  const roughDist = (p1: any, p2: any) => Math.abs(p1.lat - p2.lat) + Math.abs(p1.lon - p2.lon);
  
  for (let i = 0; i < route.length; i++) {
    const dist = roughDist(current, route[i]);
    if (dist < minNodeDist) {
      minNodeDist = dist;
      closestIdx = i;
    }
  }

  // Check segments only around the closest node (window of 20 points before and after)
  const windowStart = Math.max(0, closestIdx - 20);
  const windowEnd = Math.min(route.length - 2, closestIdx + 20);

  let minDistance = Infinity;
  for (let i = windowStart; i <= windowEnd; i++) {
    const dist = distancePointToSegmentMeters(current, route[i], route[i+1]);
    if (dist < minDistance) {
      minDistance = dist;
    }
  }
  
  return minDistance > thresholdMeters;
};

export const formatDistance = (meters: number | null | undefined): string => {
  if (meters == null) return 'Calculating...';
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1)}km`;
};
