import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, TextInput, Platform, SafeAreaView } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { useMapProvider } from '../context/MapContext';
import { getMapStyleUrl } from '../config/MapConfig';
import { reverseGeocode, searchPlaces, PlaceResult } from '../services/geocodingService';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { PrimaryButton } from '../components/PrimaryButton';
import { getCurrentLocationForAlert } from '../utils/location';

const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

let MapLibreGL: any = null;
if (!isExpoGo) {
  try {
    const mapLibreModule = require('@maplibre/maplibre-react-native');
    MapLibreGL = mapLibreModule.default ?? mapLibreModule;
  } catch (err) {
    console.warn('MapLibre not loaded', err);
  }
}

type Props = NativeStackScreenProps<RootStackParamList, 'LocationPicker'>;

export default function LocationPickerScreen({ route, navigation }: Props) {
  const { type, initialLocation } = route.params;
  const { mapStyleId } = useMapProvider();
  
  const [centerCoord, setCenterCoord] = useState<[number, number]>(
    initialLocation ? [initialLocation.longitude, initialLocation.latitude] : [80.2707, 13.0827] // Default Chennai
  );
  
  const [address, setAddress] = useState<string>('Loading address...');
  const [isFetchingAddress, setIsFetchingAddress] = useState(false);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PlaceResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  
  const mapRef = useRef<any>(null);
  const cameraRef = useRef<any>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!initialLocation) {
      // Try to get current location
      getCurrentLocationForAlert(true).then(loc => {
        if (loc && !loc.permissionDenied) {
          setCenterCoord([loc.longitude, loc.latitude]);
          updateAddress(loc.latitude, loc.longitude);
        }
      });
    } else {
      updateAddress(initialLocation.latitude, initialLocation.longitude);
    }
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, []);

  const updateAddress = async (lat: number, lon: number) => {
    setIsFetchingAddress(true);
    try {
      const addr = await reverseGeocode(lat, lon);
      setAddress(addr);
    } catch (e) {
      setAddress('Address unavailable');
    } finally {
      setIsFetchingAddress(false);
    }
  };

  const onRegionDidChange = async (event: any) => {
    // MapLibre onRegionDidChange returns event.geometry.coordinates -> [lon, lat]
    if (event && event.geometry && event.geometry.coordinates) {
      const coords = event.geometry.coordinates;
      setCenterCoord(coords as [number, number]);
      updateAddress(coords[1], coords[0]);
    }
  };

  const handleSearch = (text: string) => {
    setSearchQuery(text);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    
    if (text.length > 2) {
      setIsSearching(true);
      searchTimeoutRef.current = setTimeout(async () => {
        try {
          const results = await searchPlaces(text);
          setSearchResults(results);
        } catch (e) {
          console.warn(e);
        } finally {
          setIsSearching(false);
        }
      }, 1000);
    } else {
      setSearchResults([]);
    }
  };

  const handleSelectPlace = (place: PlaceResult) => {
    if (place.latitude && place.longitude) {
      const coords: [number, number] = [place.longitude, place.latitude];
      setCenterCoord(coords);
      setAddress(place.name);
      if (cameraRef.current) {
        cameraRef.current.setCamera({
          centerCoordinate: coords,
          zoomLevel: 15,
          animationDuration: 1000
        });
      }
      setSearchQuery('');
      setSearchResults([]);
    }
  };

  const handleConfirm = () => {
    navigation.navigate({
      name: 'SafeWindow',
      params: {
        pickedLocation: {
          type,
          latitude: centerCoord[1],
          longitude: centerCoord[0],
          address
        }
      },
      merge: true
    });
  };

  if (isExpoGo || !MapLibreGL) {
    return (
      <View style={styles.fallback}>
        <Text>MapLibre requires a native build.</Text>
      </View>
    );
  }

  const MapComponent = MapLibreGL.Map;
  const CameraComponent = MapLibreGL.Camera;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>✕ Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Select {type === 'from' ? 'Origin' : 'Destination'}</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search location..."
          value={searchQuery}
          onChangeText={handleSearch}
        />
        {isSearching && <ActivityIndicator size="small" color="#4F46E5" style={{ marginLeft: 8 }} />}
      </View>

      {searchResults.length > 0 && (
        <View style={styles.searchResults}>
          {searchResults.map(result => (
            <TouchableOpacity key={result.id} style={styles.resultItem} onPress={() => handleSelectPlace(result)}>
              <Text style={styles.resultName}>{result.name}</Text>
              <Text style={styles.resultDesc} numberOfLines={1}>{result.description}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={styles.mapContainer}>
        <MapComponent
          ref={mapRef}
          style={StyleSheet.absoluteFillObject}
          mapStyle={getMapStyleUrl(mapStyleId)}
          logoEnabled={false}
          onRegionDidChange={onRegionDidChange}
        >
          <CameraComponent
            ref={cameraRef}
            zoomLevel={15}
            centerCoordinate={centerCoord}
            animationMode="flyTo"
            animationDuration={0}
          />
        </MapComponent>

        {/* Center Pin Overlay */}
        <View style={styles.centerPinContainer} pointerEvents="none">
          <Text style={styles.centerPinIcon}>📍</Text>
        </View>
      </View>

      <View style={styles.footer}>
        <Text style={styles.addressLabel}>Selected Location:</Text>
        <Text style={styles.addressText} numberOfLines={2}>
          {isFetchingAddress ? 'Loading...' : address}
        </Text>
        <PrimaryButton title="Confirm Location" onPress={handleConfirm} style={styles.confirmBtn} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAF9' },
  fallback: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: '#FFF' },
  backBtn: { padding: 4 },
  backText: { color: '#64748B', fontSize: 16 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1E293B' },
  searchContainer: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  searchInput: { flex: 1, backgroundColor: '#F8FAFC', borderRadius: 8, padding: 12, fontSize: 16, color: '#1E293B' },
  searchResults: { position: 'absolute', top: 130, left: 16, right: 16, backgroundColor: '#FFF', borderRadius: 12, zIndex: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 5, maxHeight: 300 },
  resultItem: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  resultName: { fontSize: 16, fontWeight: '600', color: '#1E293B' },
  resultDesc: { fontSize: 13, color: '#64748B', marginTop: 2 },
  mapContainer: { flex: 1, position: 'relative' },
  centerPinContainer: { position: 'absolute', top: '50%', left: '50%', marginLeft: -15, marginTop: -35, width: 30, height: 35, justifyContent: 'center', alignItems: 'center' },
  centerPinIcon: { fontSize: 30 },
  footer: { padding: 24, backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: '#F1F5F9', shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 10 },
  addressLabel: { fontSize: 12, color: '#64748B', fontWeight: '600', textTransform: 'uppercase', marginBottom: 4 },
  addressText: { fontSize: 16, color: '#1E293B', fontWeight: '500', marginBottom: 16, minHeight: 40 },
  confirmBtn: { width: '100%' }
});
