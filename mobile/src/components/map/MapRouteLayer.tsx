import React, { useMemo, useEffect, useState, useRef } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { useMapProvider } from '../../context/MapContext';
import { getMapStyleUrl } from '../../config/MapConfig';

const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

let MapLibreGL: any = null;
if (!isExpoGo) {
  try {
    const mapLibreModule = require('@maplibre/maplibre-react-native');
    MapLibreGL = mapLibreModule.default ?? mapLibreModule;
  } catch (err) {
    console.warn('[MAP-DEBUG] MapLibreGL require() THREW:', err);
  }
}

interface MapRouteLayerProps {
  routePoints?: { lat: number; lon: number }[];
  currentLocation?: { lat: number; lon: number } | null;
  startLocation?: { lat: number; lon: number } | null;
  destinationLocation?: { lat: number; lon: number } | null;
}

export default function MapRouteLayer({ routePoints, currentLocation, startLocation, destinationLocation }: MapRouteLayerProps) {
  const { mapStyleId } = useMapProvider();

  // ── Smooth marker animation ───────────────────────────────────────────────
  const [animatedLoc, setAnimatedLoc] = useState<{lat: number, lon: number} | null>(null);
  // Track whether we've ever received a real GPS fix
  const hasReceivedFix = useRef(false);
  // Track whether the camera has been seeded with initial bounds
  const cameraModeRef = useRef<'bounds' | 'follow'>('bounds');

  useEffect(() => {
    if (!currentLocation) return;

    // First fix: snap immediately, no animation
    if (!hasReceivedFix.current) {
      hasReceivedFix.current = true;
      cameraModeRef.current = 'follow';
      setAnimatedLoc(currentLocation);
      return;
    }

    const startLoc = animatedLoc ?? currentLocation;
    const endLoc = currentLocation;

    // Snap immediately if too large (teleport) or identical
    const dlat = endLoc.lat - startLoc.lat;
    const dlon = endLoc.lon - startLoc.lon;
    const dist = Math.sqrt(dlat * dlat + dlon * dlon);
    if (dist < 0.000001 || dist > 0.01) {
      setAnimatedLoc(endLoc);
      return;
    }

    // Cubic ease-out interpolation over 1 second
    let startTime = 0;
    const duration = 1000;
    const animate = (time: number) => {
      if (!startTime) startTime = time;
      const progress = Math.min((time - startTime) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      setAnimatedLoc({
        lat: startLoc.lat + dlat * ease,
        lon: startLoc.lon + dlon * ease,
      });
      if (progress < 1) requestAnimationFrame(animate);
    };
    const rafId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafId);
  }, [currentLocation]);

  // ── Route splitting: travelled (grey) vs remaining (indigo) ──────────────
  const [travelledRoute, remainingRoute] = useMemo(() => {
    if (!routePoints || routePoints.length < 2) return [null, null];
    const first = routePoints[0];
    if (!routePoints.some(p => p.lat !== first.lat || p.lon !== first.lon)) return [null, null];

    const makeGeoJSON = (points: {lat: number, lon: number}[]) => ({
      type: 'FeatureCollection',
      features: [{
        type: 'Feature', properties: {},
        geometry: { type: 'LineString', coordinates: points.map(p => [p.lon, p.lat]) }
      }]
    });

    if (!animatedLoc) return [null, makeGeoJSON(routePoints)];

    let minIndex = 0;
    let minDist = Infinity;
    for (let i = 0; i < routePoints.length; i++) {
      const dx = routePoints[i].lon - animatedLoc.lon;
      const dy = routePoints[i].lat - animatedLoc.lat;
      const d = dx * dx + dy * dy;
      if (d < minDist) { minDist = d; minIndex = i; }
    }

    const travelled = routePoints.slice(0, minIndex + 1);
    const remaining = routePoints.slice(minIndex);
    return [
      travelled.length > 1 ? makeGeoJSON(travelled) : null,
      remaining.length > 1 ? makeGeoJSON(remaining) : null,
    ];
  }, [routePoints, animatedLoc]);

  // ── Camera: initial bounds → follow user once GPS fix arrives ────────────
  const initialBounds = useMemo(() => {
    // Priority 1: full route
    if (routePoints && routePoints.length > 0) {
      const lats = routePoints.map(p => p.lat);
      const lons = routePoints.map(p => p.lon);
      const maxLat = Math.max(...lats), minLat = Math.min(...lats);
      const maxLon = Math.max(...lons), minLon = Math.min(...lons);
      if (maxLat === minLat && maxLon === minLon) {
        return { ne: [maxLon + 0.01, maxLat + 0.01], sw: [minLon - 0.01, minLat - 0.01] };
      }
      return { ne: [maxLon, maxLat], sw: [minLon, minLat] };
    }
    // Priority 2: start + destination
    if (startLocation && destinationLocation) {
      const lats = [startLocation.lat, destinationLocation.lat];
      const lons = [startLocation.lon, destinationLocation.lon];
      const maxLat = Math.max(...lats), minLat = Math.min(...lats);
      const maxLon = Math.max(...lons), minLon = Math.min(...lons);
      if (maxLat === minLat && maxLon === minLon) {
        return { ne: [maxLon + 0.01, maxLat + 0.01], sw: [minLon - 0.01, minLat - 0.01] };
      }
      return { ne: [maxLon, maxLat], sw: [minLon, minLat] };
    }
    return null;
  }, [routePoints, startLocation, destinationLocation]);

  if (isExpoGo || !MapLibreGL) {
    return (
      <View style={styles.fallback}>
        <Text style={styles.fallbackText}>Map requires a native build.</Text>
      </View>
    );
  }

  const MapComponent = MapLibreGL.Map;
  const CameraComponent = MapLibreGL.Camera;
  const GeoJSONSource = MapLibreGL.GeoJSONSource;
  const MapLayer = MapLibreGL.Layer;
  const MarkerComp = MapLibreGL.Marker;

  // Camera: follow user once a GPS fix is received; otherwise fit initial bounds
  const renderCamera = () => {
    if (animatedLoc) {
      // Follow mode: keep user centered at street zoom level
      return (
        <CameraComponent
          center={[animatedLoc.lon, animatedLoc.lat] as [number, number]}
          zoom={16}
          duration={800}
          easing="fly"
        />
      );
    }
    if (initialBounds) {
      return (
        <CameraComponent
          bounds={[
            initialBounds.sw[0], // west
            initialBounds.sw[1], // south
            initialBounds.ne[0], // east
            initialBounds.ne[1], // north
          ] as [number, number, number, number]}
          padding={{ left: 40, right: 40, top: 100, bottom: 280 }}
          duration={800}
          easing="fly"
        />
      );
    }
    // Fallback: default center
    return (
      <CameraComponent
        center={[77.0272806, 11.0283256] as [number, number]}
        zoom={6}
        duration={0}
      />
    );
  };

  return (
    <MapComponent
      style={StyleSheet.absoluteFillObject}
      mapStyle={getMapStyleUrl(mapStyleId)}
      logoEnabled={false}
      attributionEnabled={false}
    >
      {renderCamera()}

      {/* Travelled segment: grey */}
      {travelledRoute && (
        <GeoJSONSource id="travelledRouteSource" data={travelledRoute as any}>
          <MapLayer
            id="travelledRouteFill"
            type="line"
            style={{ lineColor: '#94A3B8', lineWidth: 5, lineCap: 'round', lineJoin: 'round' }}
          />
        </GeoJSONSource>
      )}

      {/* Remaining segment: indigo */}
      {remainingRoute && (
        <GeoJSONSource id="remainingRouteSource" data={remainingRoute as any}>
          <MapLayer
            id="remainingRouteFill"
            type="line"
            style={{ lineColor: '#4F46E5', lineWidth: 5, lineCap: 'round', lineJoin: 'round' }}
          />
        </GeoJSONSource>
      )}

      {/* Fixed start pin — only shown when user has moved away from it */}
      {startLocation && animatedLoc && (
        <MarkerComp id="startPin" lngLat={[startLocation.lon, startLocation.lat]} anchor="center">
          <View style={styles.startMarker}>
            <View style={styles.startMarkerInner} />
          </View>
        </MarkerComp>
      )}

      {/* Destination pin */}
      {destinationLocation && (
        <MarkerComp id="destinationPin" lngLat={[destinationLocation.lon, destinationLocation.lat]} anchor="bottom">
          <Text style={{ fontSize: 30 }}>📍</Text>
        </MarkerComp>
      )}

      {/* Live user marker — only rendered once real GPS fix arrives */}
      {animatedLoc && (
        <MarkerComp id="userLocation" lngLat={[animatedLoc.lon, animatedLoc.lat]} anchor="center">
          <View style={styles.userMarkerOuter}>
            <View style={styles.userMarkerPulse} />
            <View style={styles.userMarkerDot} />
          </View>
        </MarkerComp>
      )}
    </MapComponent>
  );
}

const styles = StyleSheet.create({
  fallback: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#E2E8F0' },
  fallbackText: { color: '#64748B', fontSize: 14 },
  // Start pin: small green dot
  startMarker: {
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: '#10B981',
  },
  startMarkerInner: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#10B981' },
  // User marker: indigo dot with pulse ring
  userMarkerOuter: { width: 32, height: 32, justifyContent: 'center', alignItems: 'center' },
  userMarkerPulse: {
    position: 'absolute',
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(79, 70, 229, 0.15)',
    borderWidth: 1, borderColor: 'rgba(79, 70, 229, 0.3)',
  },
  userMarkerDot: {
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: '#4F46E5',
    borderWidth: 3, borderColor: '#FFFFFF',
  },
});
