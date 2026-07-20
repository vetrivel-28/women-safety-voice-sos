import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Platform,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { useMapProvider } from '../context/MapContext';
import { getMapStyleUrl } from '../config/MapConfig';
import {
  reverseGeocode,
  searchPlaces,
  geocodePlace,
  PlaceResult,
} from '../services/geocodingService';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { PrimaryButton } from '../components/PrimaryButton';
import {
  getCurrentLocationForAlert,
  getLastKnownLocation,
} from '../utils/location';
import { useMapCamera } from '../hooks/useMapCamera';

const isExpoGo =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

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
  const { cameraRef, setCenter, DEFAULT_MAP_CENTER } = useMapCamera();

  const [centerCoord, setCenterCoord] = useState<[number, number] | null>(
    initialLocation?.longitude && initialLocation?.latitude
      ? [initialLocation.longitude, initialLocation.latitude]
      : null,
  );

  const [selectedCoord, setSelectedCoord] = useState<[number, number] | null>(
    centerCoord,
  );

  const [address, setAddress] = useState<string>('Loading address...');
  const [isFetchingAddress, setIsFetchingAddress] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PlaceResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const mapRef = useRef<any>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Track if we have moved the camera at least once so we don't fight the user
  const initialCameraSet = useRef(false);

  // ── On mount: determine best initial coordinate ──────────────────────────
  useEffect(() => {
    console.log('[LocationPicker] mounted. Route params:', route.params);
    try {
      if (initialLocation?.latitude && initialLocation?.longitude) {
      console.log('[LocationPicker] Initial location provided:', initialLocation);
      updateAddress(initialLocation.latitude, initialLocation.longitude);
      scheduleSetCenter(
        initialLocation.longitude,
        initialLocation.latitude,
        15,
        0,
      );
    } else {
      console.log('[LocationPicker] No initial location, attempting fallback');
      const fetchBestLocation = async () => {
        let bestCoords: [number, number] = DEFAULT_MAP_CENTER;

        try {
          const lastLoc = await getLastKnownLocation();
          if (
            lastLoc &&
            !lastLoc.permissionDenied &&
            lastLoc.latitude &&
            lastLoc.longitude
          ) {
            bestCoords = [lastLoc.longitude, lastLoc.latitude];
            setCenterCoord(bestCoords);
            setSelectedCoord(bestCoords);
          }
        } catch (_) {
          // ignore — fallback to default
        }

        try {
          const gpsLoc = await getCurrentLocationForAlert(true);
          console.log('[LocationPicker] GPS fetch result:', gpsLoc);
          if (
            gpsLoc &&
            !gpsLoc.permissionDenied &&
            gpsLoc.latitude &&
            gpsLoc.longitude &&
            Number.isFinite(gpsLoc.latitude) &&
            Number.isFinite(gpsLoc.longitude)
          ) {
            bestCoords = [gpsLoc.longitude, gpsLoc.latitude];
            setCenterCoord(bestCoords);
            setSelectedCoord(bestCoords);
            updateAddress(gpsLoc.latitude, gpsLoc.longitude);
          } else {
            console.log('[LocationPicker] GPS invalid/denied. Falling back.');
            setCenterCoord(bestCoords);
            setSelectedCoord(bestCoords);
            updateAddress(bestCoords[1], bestCoords[0]);
          }
        } catch (e: any) {
          console.error('[LocationPicker] GPS fetch crashed:', e, e?.stack);
          setCenterCoord(bestCoords);
          setSelectedCoord(bestCoords);
          updateAddress(bestCoords[1], bestCoords[0]);
        }

        console.log('[LocationPicker] Best coords decided:', bestCoords);
        scheduleSetCenter(bestCoords[0], bestCoords[1], 15, 100);
      };

      fetchBestLocation();
    } // closes else
    } catch (e: any) {
      console.error('[LocationPicker] Mount effect crashed:', e, e?.stack);
    }

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
      if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);
    };
  }, []);

  const scheduleSetCenter = (
    lon: number,
    lat: number,
    zoom: number,
    delayMs: number,
  ) => {
    if (delayMs > 0) {
      setTimeout(() => setCenter(lon, lat, zoom, 0), delayMs);
    } else {
      setCenter(lon, lat, zoom, 0);
    }
  };

  const updateAddress = async (lat: number, lon: number) => {
    setIsFetchingAddress(true);
    try {
      const addr = await reverseGeocode(lat, lon);
      setAddress(addr);
    } catch (_) {
      setAddress(`${lat.toFixed(6)}, ${lon.toFixed(6)}`);
    } finally {
      setIsFetchingAddress(false);
    }
  };

  const onRegionDidChange = async (event: any) => {
    try {
      if (event?.geometry?.coordinates) {
        const coords = event.geometry.coordinates as [number, number];
        if (Number.isFinite(coords[0]) && Number.isFinite(coords[1])) {
          setSelectedCoord(coords);

          if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);
          debounceTimeoutRef.current = setTimeout(() => {
            updateAddress(coords[1], coords[0]);
          }, 400);
        } else {
          console.error('[LocationPicker] CRITICAL: Invalid geometry coordinates:', coords);
        }
      }
    } catch (e: any) {
      console.error('[LocationPicker] onRegionDidChange crashed:', e, e?.stack);
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
          console.warn('[LocationPicker] Search failed', e);
          setSearchResults([]);
        } finally {
          setIsSearching(false);
        }
      }, 600);
    } else {
      setIsSearching(false);
      setSearchResults([]);
    }
  };

  const handleSelectPlace = async (place: PlaceResult) => {
    setSearchResults([]);
    setSearchQuery('');

    let lat = place.latitude;
    let lon = place.longitude;

    if (!lat || !lon) {
      setIsFetchingAddress(true);
      try {
        const coords = await geocodePlace(place.id);
        if (coords) {
          lat = coords.latitude;
          lon = coords.longitude;
        }
      } finally {
        setIsFetchingAddress(false);
      }
    }

    if (lat && lon) {
      const coords: [number, number] = [lon, lat];
      setCenterCoord(coords);
      setSelectedCoord(coords);
      setAddress(place.name);
      setCenter(lon, lat, 15, 800);
    } else {
      setAddress('Could not find coordinates for this location');
    }
  };

  // ── Confirm: return the picked location to the calling screen ─────────────
  // We use navigation.navigate() with the parent screen name + merge params.
  // This is safe because SafeWindow is always the screen that pushed us.
  // We pass the result as route params and pop back.
  const handleConfirm = () => {
    try {
      console.log('[LocationPicker] handleConfirm called. SelectedCoord:', selectedCoord);
      if (!selectedCoord) return;

      if (!Number.isFinite(selectedCoord[0]) || !Number.isFinite(selectedCoord[1])) {
        console.error('[LocationPicker] Cannot confirm invalid coords:', selectedCoord);
        return;
      }

      const finalAddress =
        isFetchingAddress ||
        address === 'Loading address...' ||
        address === 'Address unavailable'
          ? `${selectedCoord[1].toFixed(6)}, ${selectedCoord[0].toFixed(6)}`
          : address;

      console.log('[LocationPicker] Navigation returning params:', {
        type,
        latitude: selectedCoord[1],
        longitude: selectedCoord[0],
        address: finalAddress,
      });

      navigation.navigate('SafeWindow', {
        pickedLocation: {
          type,
          latitude: selectedCoord[1],
          longitude: selectedCoord[0],
          address: finalAddress,
        },
      });
    } catch (e: any) {
      console.error('[LocationPicker] handleConfirm crashed:', e, e?.stack);
    }
  };

  if (isExpoGo || !MapLibreGL) {
    return (
      <View style={styles.fallback}>
        <Text style={styles.fallbackText}>Map requires a native build.</Text>
      </View>
    );
  }

  const MapComponent = MapLibreGL.Map;
  const CameraComponent = MapLibreGL.Camera;

  return (
    <SafeAreaView style={styles.container}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.backText}>✕ Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {type === 'from' ? 'Select Start Location' : 'Select Destination'}
        </Text>
        <View style={{ width: 70 }} />
      </View>

      {/* ── Search Bar ─────────────────────────────────────────────────── */}
      <View style={styles.searchContainer}>
        <View style={styles.searchInputWrapper}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder={
              type === 'from'
                ? 'Search start location...'
                : 'Search destination...'
            }
            placeholderTextColor="#94A3B8"
            value={searchQuery}
            onChangeText={handleSearch}
            autoCorrect={false}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              onPress={() => {
                setSearchQuery('');
                setSearchResults([]);
              }}
              style={styles.clearSearchBtn}
            >
              <Text style={styles.clearSearchText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
        {isSearching && (
          <ActivityIndicator
            size="small"
            color="#4F46E5"
            style={{ marginLeft: 10 }}
          />
        )}
      </View>

      {/* ── Search Results Dropdown ─────────────────────────────────────── */}
      {searchResults.length > 0 && (
        <View style={styles.searchResultsContainer}>
          <FlatList
            data={searchResults}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.resultItem}
                onPress={() => handleSelectPlace(item)}
                activeOpacity={0.7}
              >
                <Text style={styles.resultName} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.resultDesc} numberOfLines={1}>
                  {item.description}
                </Text>
              </TouchableOpacity>
            )}
          />
        </View>
      )}

      {searchQuery.length > 2 &&
        searchResults.length === 0 &&
        !isSearching && (
          <View style={styles.searchResultsContainer}>
            <View style={styles.noResultItem}>
              <Text style={styles.noResultText}>No results found</Text>
              <Text style={styles.noResultDesc}>
                Try a different name, address, or landmark
              </Text>
            </View>
          </View>
        )}

      {/* ── Map ────────────────────────────────────────────────────────── */}
      <View style={styles.mapContainer}>
        <MapComponent
          ref={mapRef}
          style={StyleSheet.absoluteFillObject}
          mapStyle={getMapStyleUrl(mapStyleId)}
          logoEnabled={false}
          attributionEnabled={false}
          onRegionDidChange={onRegionDidChange}
        >
          {centerCoord && Number.isFinite(centerCoord[0]) && Number.isFinite(centerCoord[1]) ? (
            <CameraComponent
              ref={cameraRef}
              defaultSettings={{
                centerCoordinate: centerCoord,
                zoomLevel: 14,
              }}
            />
          ) : (
             <CameraComponent
              ref={cameraRef}
              defaultSettings={{
                centerCoordinate: DEFAULT_MAP_CENTER,
                zoomLevel: 14,
              }}
            />
          )}
        </MapComponent>

        {/* Crosshair Pin */}
        <View style={styles.pinContainer} pointerEvents="none">
          <Text style={styles.pinIcon}>📍</Text>
        </View>

        {/* "Use Current Location" button overlaid on map */}
        <TouchableOpacity
          style={styles.currentLocBtn}
          onPress={async () => {
            try {
              const loc = await getCurrentLocationForAlert(true);
              if (loc && !loc.permissionDenied && loc.latitude && loc.longitude) {
                const coords: [number, number] = [loc.longitude, loc.latitude];
                setCenterCoord(coords);
                setSelectedCoord(coords);
                updateAddress(loc.latitude, loc.longitude);
                setCenter(loc.longitude, loc.latitude, 16, 600);
              }
            } catch (e) {
              console.warn('[LocationPicker] GPS fetch failed', e);
            }
          }}
        >
          <Text style={styles.currentLocIcon}>◎</Text>
        </TouchableOpacity>
      </View>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <View style={styles.footer}>
        <Text style={styles.addressLabel}>Selected Location</Text>
        <Text style={styles.addressText} numberOfLines={2}>
          {isFetchingAddress ? 'Loading address...' : address}
        </Text>
        <PrimaryButton
          title="Confirm Location"
          onPress={handleConfirm}
          disabled={!selectedCoord}
          style={styles.confirmBtn}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAF9' },
  fallback: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
  },
  fallbackText: { fontSize: 16, color: '#64748B', fontWeight: '600' },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  backBtn: { paddingVertical: 4, paddingHorizontal: 4, minWidth: 70 },
  backText: { color: '#4F46E5', fontSize: 15, fontWeight: '600' },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
    textAlign: 'center',
    flex: 1,
  },

  // Search
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  searchInputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 10 : 6,
  },
  searchIcon: { fontSize: 15, marginRight: 8 },
  searchInput: { flex: 1, fontSize: 15, color: '#1E293B' },
  clearSearchBtn: { padding: 4 },
  clearSearchText: { fontSize: 13, color: '#94A3B8', fontWeight: '700' },

  // Results
  searchResultsContainer: {
    position: 'absolute',
    top: 128,
    left: 12,
    right: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    zIndex: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 8,
    maxHeight: 280,
    overflow: 'hidden',
  },
  resultItem: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  resultName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 2,
  },
  resultDesc: { fontSize: 13, color: '#64748B' },
  noResultItem: {
    paddingVertical: 20,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  noResultText: { fontSize: 15, fontWeight: '600', color: '#475569' },
  noResultDesc: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 4,
    textAlign: 'center',
  },

  // Map
  mapContainer: { flex: 1, position: 'relative' },
  pinContainer: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -15,
    marginTop: -36,
    width: 30,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pinIcon: { fontSize: 30 },
  currentLocBtn: {
    position: 'absolute',
    right: 16,
    bottom: 24,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  currentLocIcon: { fontSize: 22, color: '#4F46E5' },

  // Footer
  footer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 10,
  },
  addressLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  addressText: {
    fontSize: 15,
    color: '#1E293B',
    fontWeight: '500',
    marginBottom: 14,
    minHeight: 38,
    lineHeight: 20,
  },
  confirmBtn: { width: '100%' },
});
