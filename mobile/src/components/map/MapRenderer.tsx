import React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { useMapProvider } from '../../context/MapContext';
import { FamilyMemberLocation } from '../../types';
import MapLibreRenderer from './MapLibreRenderer';

export interface MapRendererProps {
  locations: FamilyMemberLocation[];
  myUserId: string | null;
  mapZoom: number;
  centerCoordinate: [number, number]; // [longitude, latitude]
}

export default function MapRenderer(props: MapRendererProps) {
  const { isLoading } = useMapProvider();

  if (isLoading) {
    return (
      <View style={styles.mapFallback}>
        <Text style={styles.fallbackText}>Loading Map...</Text>
      </View>
    );
  }

  return <MapLibreRenderer {...props} />;
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
  }
});
