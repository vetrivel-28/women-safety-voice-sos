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
  p1: { lat: number, lon: number },
  p2: { lat: number, lon: number },
  p3: { lat: number, lon: number }
): number => {
  const d13 = distanceBetweenPointsMeters(p1.lat, p1.lon, p3.lat, p3.lon);
  const d12 = distanceBetweenPointsMeters(p1.lat, p1.lon, p2.lat, p2.lon);
  const d23 = distanceBetweenPointsMeters(p2.lat, p2.lon, p3.lat, p3.lon);

  if (d12 === 0) return d13;

  // If angle is obtuse at p1 or p2, the closest point is the endpoint
  if (d13 * d13 > d12 * d12 + d23 * d23) return d23;
  if (d23 * d23 > d12 * d12 + d13 * d13) return d13;

  const s = (d13 + d12 + d23) / 2;
  const area = Math.sqrt(s * (s - d13) * (s - d12) * (s - d23));
  return (2 * area) / d12;
};

export const isRouteDeviation = (
  current: { lat: number, lon: number },
  start: { lat: number, lon: number },
  destination: { lat: number, lon: number },
  thresholdMeters: number = 300
): boolean => {
  const dist = distancePointToSegmentMeters(start, destination, current);
  return dist > thresholdMeters;
};

export const formatDistance = (meters: number | null | undefined): string => {
  if (meters == null) return 'Calculating...';
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1)}km`;
};
