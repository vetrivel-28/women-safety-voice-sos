import React, { useEffect, useState, useMemo, useRef } from 'react';
import { StyleSheet, View, Text, Animated } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { MapRendererProps } from './MapRenderer';
import { getStatusColor } from '../../screens/FamilyLiveMapScreen';

import { useMapProvider } from '../../context/MapContext';
import { getMapStyleUrl } from '../../config/MapConfig';

const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

let MapLibreGL: any = null;
let mapLibreLoadedInitial = false;

if (!isExpoGo) {
  try {
    const mapLibreModule = require('@maplibre/maplibre-react-native');
    const resolvedMapLibre = mapLibreModule.default ?? mapLibreModule;

    const hasMap = !!resolvedMapLibre?.MapView || !!resolvedMapLibre?.Map;
    const hasCamera = !!resolvedMapLibre?.Camera;

    MapLibreGL = resolvedMapLibre;
    mapLibreLoadedInitial = hasMap && hasCamera;
  } catch (err: any) {
    mapLibreLoadedInitial = false;
  }
}

// AnimatedMarkerWrapper subscribes to two Animated.Values (lat, lng) and
// re-renders the MapLibre Marker only when the interpolated position changes.
// This keeps smooth animation without tying the whole map to Animated's driver.
interface AnimatedMarkerProps {
  MarkerComp: any;
  userId: string;
  animLat: Animated.Value | null;
  animLng: Animated.Value | null;
  fallbackLat: number;
  fallbackLng: number;
  color: string;
}

function AnimatedMarkerWrapper({
  MarkerComp,
  userId,
  animLat,
  animLng,
  fallbackLat,
  fallbackLng,
  color,
}: AnimatedMarkerProps) {
  const [pos, setPos] = React.useState<[number, number]>([fallbackLng, fallbackLat]);

  useEffect(() => {
    if (!animLat || !animLng) return;

    // Read current values immediately so first render shows correct position.
    setPos([(animLng as any)._value, (animLat as any)._value]);

    // Subscribe to future animation frames.
    const latId = animLat.addListener(({ value: lat }) => {
      setPos(prev => [prev[0], lat]);
    });
    const lngId = animLng.addListener(({ value: lng }) => {
      setPos(prev => [lng, prev[1]]);
    });

    return () => {
      animLat.removeListener(latId);
      animLng.removeListener(lngId);
    };
  }, [animLat, animLng]);

  return (
    <MarkerComp
      id={`family-marker-${userId}`}
      lngLat={pos}
      anchor="center"
    >
      <View style={[styles.markerView, { backgroundColor: color }]}>
        <View style={styles.markerInnerDot} />
      </View>
    </MarkerComp>
  );
}

export default function MapLibreRenderer({
  locations,
  myUserId,
  mapZoom,
  centerCoordinate
}: MapRendererProps) {
  const [mapLibreLoaded, setMapLibreLoaded] = useState(mapLibreLoadedInitial);
  const { mapStyleId } = useMapProvider();

  // Per-member animated coordinate values. Keyed by user_id.
  // Each entry holds two Animated.Values (lat, lng) that we interpolate
  // whenever that member's coordinates change.
  const animatedCoords = useRef<
    Record<string, { lat: Animated.Value; lng: Animated.Value }>
  >({});

  useEffect(() => {
    setMapLibreLoaded(mapLibreLoadedInitial);
  }, []);

  const plottableLocs = useMemo(() => {
    return locations.filter(l => l.has_location && l.sharing_enabled && l.latitude != null && l.longitude != null);
  }, [locations]);

  // Animate each member to their new coordinates when locations updates.
  useEffect(() => {
    plottableLocs.forEach(loc => {
      const lat = loc.latitude!;
      const lng = loc.longitude!;
      const existing = animatedCoords.current[loc.user_id];

      if (!existing) {
        // First time we see this member — create values at their current position
        // (no animation on initial appearance).
        animatedCoords.current[loc.user_id] = {
          lat: new Animated.Value(lat),
          lng: new Animated.Value(lng),
        };
      } else {
        // Member already on map — animate to new position over 500ms.
        Animated.parallel([
          Animated.timing(existing.lat, {
            toValue: lat,
            duration: 500,
            useNativeDriver: false, // coordinate values can't use native driver
          }),
          Animated.timing(existing.lng, {
            toValue: lng,
            duration: 500,
            useNativeDriver: false,
          }),
        ]).start();
      }
    });

    // Clean up entries for members who left the plottable set.
    const plottableIds = new Set(plottableLocs.map(l => l.user_id));
    Object.keys(animatedCoords.current).forEach(id => {
      if (!plottableIds.has(id)) {
        delete animatedCoords.current[id];
      }
    });
  }, [plottableLocs]);

  if (!mapLibreLoaded || !MapLibreGL) {
    return (
      <View style={styles.mapFallback}>
        <Text style={styles.fallbackText}>MapLibre is temporarily unavailable.</Text>
      </View>
    );
  }

  if (plottableLocs.length === 0) {
    return (
      <View style={styles.mapFallback}>
        <Text style={styles.fallbackText}>No family members are currently sharing their location.</Text>
        <Text style={styles.fallbackSubtext}>Enable location sharing to see the map.</Text>
      </View>
    );
  }

  const MapComponent = MapLibreGL.Map;
  const CameraComponent = MapLibreGL.Camera;
  const MarkerComp = MapLibreGL.Marker;
  
  const mapStyleUrl = getMapStyleUrl(mapStyleId);

  return (
    <MapComponent
      style={StyleSheet.absoluteFillObject}
      mapStyle={mapStyleUrl}
      logo={false}
      attribution={true}
      attributionPosition={{ bottom: 8, right: 8 }}
    >
      <CameraComponent
        zoom={mapZoom}
        center={centerCoordinate}
        duration={0}
      />
      {plottableLocs.map(loc => {
        const anim = animatedCoords.current[loc.user_id];

        return (
          <AnimatedMarkerWrapper
            key={loc.user_id}
            MarkerComp={MarkerComp}
            userId={loc.user_id}
            animLat={anim?.lat ?? null}
            animLng={anim?.lng ?? null}
            fallbackLat={loc.latitude!}
            fallbackLng={loc.longitude!}
            color={getStatusColor(loc.status, loc.is_stale)}
          />
        );
      })}
    </MapComponent>
  );
}

const styles = StyleSheet.create({
  mapFallback: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#E2E8F0',
    padding: 24,
  },
  fallbackText: {
    fontSize: 16,
    color: '#475569',
    textAlign: 'center',
    fontWeight: '600',
    marginBottom: 8,
  },
  fallbackSubtext: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
  },
  markerView: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 3,
    borderColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  markerInnerDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: 'white',
  },
});
