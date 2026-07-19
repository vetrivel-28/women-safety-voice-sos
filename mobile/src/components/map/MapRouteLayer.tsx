import React, { useMemo, useEffect } from 'react';
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
    console.warn('[MAP-DEBUG] MapLibreGL require() THREW — this is why the map is blank:', err);
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

  if (isExpoGo || !MapLibreGL) {
    return (
      <View style={styles.fallback}>
        <Text>MapLibre requires a native build.</Text>
      </View>
    );
  }

  const MapComponent = MapLibreGL.Map;
  const CameraComponent = MapLibreGL.Camera;
  const ShapeSource = MapLibreGL.ShapeSource;
  const LineLayer = MapLibreGL.LineLayer;
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
        <ShapeSource id="routeSource" shape={routeGeoJSON}>
          <LineLayer
            id="routeFill"
            style={{
              lineColor: '#4F46E5',
              lineWidth: 5,
              lineCap: 'round',
              lineJoin: 'round'
            }}
          />
        </GeoJSONSource>
      )}

      {startLocation && (
        <MarkerComp id="startLocation" lngLat={[startLocation.lon, startLocation.lat]} anchor="center">
          <View style={[styles.currentLocMarker, { borderColor: '#10B981', backgroundColor: 'rgba(16, 185, 129, 0.2)' }]}>
            <View style={[styles.currentLocInner, { backgroundColor: '#10B981' }]} />
          </View>
        </MarkerComp>
      )}

      {destinationLocation && (
        <MarkerComp id="destination" lngLat={[destinationLocation.lon, destinationLocation.lat]} anchor="bottom">
          <Text style={{ fontSize: 32 }}>📍</Text>
        </MarkerComp>
      )}

      {currentLocation && (
        <MarkerComp id="currentLocation" lngLat={[currentLocation.lon, currentLocation.lat]} anchor="center">
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
