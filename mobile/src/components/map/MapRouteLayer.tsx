import React, { useMemo, useEffect } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { useMapProvider } from '../../context/MapContext';
import { getMapStyleUrl } from '../../config/MapConfig';

const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

// [MAP-DEBUG] Module-level: log isExpoGo and MapLibre load result once at import time
console.log('[MAP-DEBUG] isExpoGo:', isExpoGo, '| executionEnvironment:', Constants.executionEnvironment);

let MapLibreGL: any = null;
if (!isExpoGo) {
  try {
    const mapLibreModule = require('@maplibre/maplibre-react-native');
    MapLibreGL = mapLibreModule.default ?? mapLibreModule;
    console.log('[MAP-DEBUG] MapLibreGL loaded successfully, null?', MapLibreGL === null);
  } catch (err) {
    // [MAP-DEBUG] Log the actual error so we know exactly why it failed
    console.warn('[MAP-DEBUG] MapLibreGL require() THREW — this is why the map is blank:', err);
  }
} else {
  console.log('[MAP-DEBUG] Skipped MapLibreGL require() because isExpoGo === true');
}

interface MapRouteLayerProps {
  routePoints?: { lat: number; lon: number }[];
  currentLocation?: { lat: number; lon: number } | null;
  startLocation?: { lat: number; lon: number } | null;
  destinationLocation?: { lat: number; lon: number } | null;
}

export default function MapRouteLayer({ routePoints, currentLocation, startLocation, destinationLocation }: MapRouteLayerProps) {
  const { mapStyleId } = useMapProvider();

  const routeGeoJSON = useMemo(() => {
    if (!routePoints || routePoints.length < 2) return null;
    
    // Check if all points are identical (crashes MapLibre)
    const first = routePoints[0];
    const hasDifferentPoint = routePoints.some(p => p.lat !== first.lat || p.lon !== first.lon);
    if (!hasDifferentPoint) return null;

    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: routePoints.map(p => [p.lon, p.lat])
          }
        }
      ]
    };
  }, [routePoints]);

  const bounds = useMemo(() => {
    // Priority 1: fit to the full route polyline
    if (routePoints && routePoints.length > 0) {
      const lats = routePoints.map(p => p.lat);
      const lons = routePoints.map(p => p.lon);
      const maxLat = Math.max(...lats);
      const minLat = Math.min(...lats);
      const maxLon = Math.max(...lons);
      const minLon = Math.min(...lons);

      // MapLibre Camera bounds crash if ne === sw (zero area)
      if (maxLat === minLat && maxLon === minLon) {
        return {
          ne: [maxLon + 0.01, maxLat + 0.01],
          sw: [minLon - 0.01, minLat - 0.01]
        };
      }
      return { ne: [maxLon, maxLat], sw: [minLon, minLat] };
    }

    // Priority 2: no route yet — fit to start + destination so the camera shows
    // something useful immediately (e.g. on first render before OSRM responds,
    // or after app kill/reopen before the route is re-fetched).
    if (startLocation && destinationLocation) {
      const lats = [startLocation.lat, destinationLocation.lat];
      const lons = [startLocation.lon, destinationLocation.lon];
      const maxLat = Math.max(...lats);
      const minLat = Math.min(...lats);
      const maxLon = Math.max(...lons);
      const minLon = Math.min(...lons);
      if (maxLat === minLat && maxLon === minLon) {
        return {
          ne: [maxLon + 0.01, maxLat + 0.01],
          sw: [minLon - 0.01, minLat - 0.01]
        };
      }
      return { ne: [maxLon, maxLat], sw: [minLon, minLat] };
    }

    // Priority 3: only current location known — center on it
    if (currentLocation) {
      return {
        ne: [currentLocation.lon + 0.01, currentLocation.lat + 0.01],
        sw: [currentLocation.lon - 0.01, currentLocation.lat - 0.01]
      };
    }

    // Priority 4: nothing — fall through to hardcoded center in camera render
    return null;
  }, [routePoints, currentLocation, startLocation, destinationLocation]);

  // [MAP-DEBUG] Log every time any of the four key values change so we can see
  // exactly what the component receives at each render during an active journey.
  useEffect(() => {
    const routeLen = routePoints?.length ?? 0;
    const first = routePoints && routePoints.length > 0 ? routePoints[0] : null;
    const last  = routePoints && routePoints.length > 0 ? routePoints[routePoints.length - 1] : null;
    const allSame = routePoints && routePoints.length >= 2
      ? !routePoints.some(p => p.lat !== routePoints![0].lat || p.lon !== routePoints![0].lon)
      : false;
    console.log(
      '[MAP-DEBUG] props changed:',
      '\n  routePoints.length:', routeLen,
      '| first:', first ? `(${first.lat},${first.lon})` : 'null',
      '| last:', last ? `(${last.lat},${last.lon})` : 'null',
      '| allSame (would kill polyline):', allSame,
      '\n  currentLocation:', currentLocation ? `(${currentLocation.lat},${currentLocation.lon})` : 'null',
      '\n  destinationLocation:', destinationLocation ? `(${destinationLocation.lat},${destinationLocation.lon})` : 'null',
      '\n  startLocation:', startLocation ? `(${startLocation.lat},${startLocation.lon})` : 'null',
      '\n  bounds:', bounds ? `ne=${JSON.stringify(bounds.ne)} sw=${JSON.stringify(bounds.sw)}` : 'null',
      '\n  routeGeoJSON is null?:', routeGeoJSON === null
    );
  }, [routePoints, currentLocation, destinationLocation, startLocation, bounds, routeGeoJSON]);

  // [MAP-DEBUG] Log at the guard point so we know whether we're returning the
  // fallback view (blank screen) or proceeding to render the real map.
  if (isExpoGo || !MapLibreGL) {
    console.log('[MAP-DEBUG] RETURNING FALLBACK VIEW — isExpoGo:', isExpoGo, '| MapLibreGL null:', MapLibreGL === null);
    return (
      <View style={styles.fallback}>
        <Text>MapLibre requires a native build.</Text>
      </View>
    );
  }

  console.log('[MAP-DEBUG] Rendering real MapLibre map — mapStyleId:', mapStyleId);

  const MapComponent = MapLibreGL.Map;
  const CameraComponent = MapLibreGL.Camera;
  const ShapeSource = MapLibreGL.GeoJSONSource;
  const LineLayer = MapLibreGL.Layer;
  const MarkerComp = MapLibreGL.Marker;

  return (
    <MapComponent
      style={StyleSheet.absoluteFillObject}
      mapStyle={getMapStyleUrl(mapStyleId)}
      logoEnabled={false}
      attributionEnabled={false}
    >
      {bounds && Array.isArray(bounds.ne) && Array.isArray(bounds.sw) && bounds.ne.length === 2 && bounds.sw.length === 2 ? (
        <CameraComponent
          bounds={[
            bounds.sw[0], // west
            bounds.sw[1], // south
            bounds.ne[0], // east
            bounds.ne[1], // north
          ]}
          padding={{
            left: 40,
            right: 40,
            top: 40,
            bottom: 250 // Leave space for bottom card
          }}
          duration={1000}
        />
      ) : (
        <CameraComponent
          center={currentLocation ? [currentLocation.lon, currentLocation.lat] : [77.0272806, 11.0283256]}
          zoom={currentLocation ? 15 : 6}
          duration={1000}
        />
      )}

      {routeGeoJSON && (
        <ShapeSource id="routeSource" data={routeGeoJSON}>
          <LineLayer
            id="routeFill"
            type="line"
            style={{
              lineColor: '#4F46E5',
              lineWidth: 5,
              lineCap: 'round',
              lineJoin: 'round'
            }}
          />
        </ShapeSource>
      )}

      {destinationLocation && (
        <MarkerComp id="destination" coordinate={[destinationLocation.lon, destinationLocation.lat]} anchor={{x: 0.5, y: 1}}>
          <Text style={{ fontSize: 32 }}>📍</Text>
        </MarkerComp>
      )}

      {currentLocation && (
        <MarkerComp id="currentLocation" coordinate={[currentLocation.lon, currentLocation.lat]} anchor={{x: 0.5, y: 0.5}}>
          <View style={styles.currentLocMarker}>
            <View style={styles.currentLocInner} />
          </View>
        </MarkerComp>
      )}
    </MapComponent>
  );
}

const styles = StyleSheet.create({
  fallback: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F1F5F9' },
  currentLocMarker: { width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(79, 70, 229, 0.2)', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#4F46E5' },
  currentLocInner: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#4F46E5' }
});
