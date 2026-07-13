import React, { useEffect, useState, useMemo } from 'react';
import { StyleSheet, View, Text } from 'react-native';
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
    console.log('[MAP RUNTIME] mapLibre error =', err?.message ?? String(err));
  }
}

export default function MapLibreRenderer({
  locations,
  myUserId,
  mapZoom,
  centerCoordinate
}: MapRendererProps) {
  const [mapLibreLoaded, setMapLibreLoaded] = useState(mapLibreLoadedInitial);
  const { mapStyleId } = useMapProvider();

  useEffect(() => {
    setMapLibreLoaded(mapLibreLoadedInitial);
  }, []);

  const plottableLocs = useMemo(() => {
    return locations.filter(l => l.has_location && l.sharing_enabled && l.latitude != null && l.longitude != null);
  }, [locations]);

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
        zoomLevel={mapZoom}
        centerCoordinate={centerCoordinate}
        animationDuration={0}
      />
      {plottableLocs.map(loc => (
        <MarkerComp
          key={loc.user_id}
          id={`family-marker-${loc.user_id}`}
          lngLat={[loc.longitude!, loc.latitude!]}
          anchor="center"
        >
          <View style={[styles.markerView, { backgroundColor: getStatusColor(loc.status, loc.is_stale) }]}>
            <View style={styles.markerInnerDot} />
          </View>
        </MarkerComp>
      ))}
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
