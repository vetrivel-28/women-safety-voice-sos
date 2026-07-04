import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Switch, Alert, FlatList, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFamily } from '../context/FamilyContext';
import { familyLocationsApi } from '../api/familyLocations';
import { FamilyMemberLocation } from '../types';
import { supabase } from '../lib/supabaseClient';
import { getCurrentLocationForAlert } from '../utils/location';
import Constants, { ExecutionEnvironment } from 'expo-constants';

// Debug logs for APK gating issue
console.log('[MAP RUNTIME] appOwnership =', Constants.appOwnership);
console.log('[MAP RUNTIME] executionEnvironment =', Constants.executionEnvironment);

// Dynamic import for MapLibre to avoid Expo Go crash
const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
console.log('[MAP RUNTIME] isExpoGo =', isExpoGo);

let MapLibreGL: any = null;
if (!isExpoGo) {
  try {
    MapLibreGL = require('@maplibre/maplibre-react-native').default;
    console.log('[MAP RUNTIME] mapLibreLoaded =', !!MapLibreGL);
  } catch (e: any) {
    console.log('[MAP RUNTIME] mapLibreLoaded =', false);
    console.log('[MAP RUNTIME] mapLibre error =', e?.message || String(e));
  }
}

export default function FamilyLiveMapScreen() {
  console.log('[FAMILY MAP BUILD MARKER] family-map-debug-v3');
  const { family } = useFamily();
  const [locations, setLocations] = useState<FamilyMemberLocation[]>([]);
  const [sharingEnabled, setSharingEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session) setMyUserId(data.session.user.id);
    });
  }, []);

  useEffect(() => {
    if (family) {
      fetchLocations();
    }
  }, [family]);

  useEffect(() => {
    if (myUserId && locations.length > 0) {
       const myLoc = locations.find(l => l.user_id === myUserId);
       if (myLoc) setSharingEnabled(myLoc.sharing_enabled);
    }
  }, [locations, myUserId]);

  useEffect(() => {
    if (!family) return;
    
    const intervalTime = 30000;
    
    const tick = async () => {
      if (errorMsg) return; // Back off polling on errors
      await fetchLocations();
      if (sharingEnabled && !errorMsg) {
        await updateMyLocation();
      }
    };

    timerRef.current = setInterval(tick, intervalTime);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [sharingEnabled, family]);

  const fetchLocations = async () => {
    if (!family) return;
    try {
      setErrorMsg(null);
      const data = await familyLocationsApi.getLocations(family.id);
      console.log('[FAMILY API RAW RESPONSE]', JSON.stringify(data));
      setLocations(data);
      setErrorMsg(null);
    } catch (e: any) {
      console.warn('Failed to fetch family locations', e);
      if (e?.response?.status === 500) {
        setErrorMsg('Live location table is not ready. Please run the latest migration.');
      } else {
        setErrorMsg('Could not load family locations. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const updateMyLocation = async () => {
    try {
      const loc = await getCurrentLocationForAlert(true);
      if (loc && !loc.permissionDenied) {
        await familyLocationsApi.updateLocation({
          latitude: loc.latitude,
          longitude: loc.longitude,
          accuracy: loc.accuracy,
          source: 'FOREGROUND'
        });
      }
    } catch (e) {
      console.warn('Failed to update my location', e);
    }
  };

  const handleToggleSharing = async (val: boolean) => {
    setSharingEnabled(val);
    try {
      await familyLocationsApi.toggleSharing(val);
      if (val) {
        await updateMyLocation();
        await fetchLocations();
      }
    } catch (e) {
      Alert.alert('Error', 'Could not update sharing preference.');
      setSharingEnabled(!val);
    }
  };

  const getStatusColor = (status: string, isStale?: boolean) => {
    if (isStale || status === 'OFFLINE') return '#94A3B8';
    if (status === 'SOS_ACTIVE') return '#DC2626';
    if (status === 'CHECKIN_MISSED') return '#D97706';
    if (status === 'IN_SAFE_WINDOW') return '#4F46E5';
    return '#166534';
  };
  
  const formatTime = (isoStr: string) => {
    const d = new Date(isoStr);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (!family) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.center}><Text>No family selected.</Text></View>
      </SafeAreaView>
    );
  }

  const renderListItem = ({ item }: { item: FamilyMemberLocation }) => {
    console.log('[FAMILY UI LOCATION ITEM]', JSON.stringify(item));
    
    let statusText = '';
    let statusColor = '#94A3B8';
    let timeText = '';
    
    const hasValidCoords = typeof item.latitude === 'number' && typeof item.longitude === 'number';
    console.log(`[FAMILY UI HAS VALID COORDS] userId=${item.user_id} valid=${hasValidCoords}`);

    if (!item.sharing_enabled) {
      statusText = 'SHARING OFF';
      statusColor = '#94A3B8';
    } else if (!item.has_location) {
      statusText = 'NO LOCATION YET';
      statusColor = '#94A3B8';
    } else if (item.is_stale || item.status === 'OFFLINE') {
      statusText = 'OFFLINE';
      statusColor = '#94A3B8';
      timeText = item.updated_at ? `Last seen: ${formatTime(item.updated_at)}` : '';
    } else {
      statusText = item.status.replace('_', ' ');
      statusColor = getStatusColor(item.status, item.is_stale);
      timeText = item.updated_at ? `Updated: ${formatTime(item.updated_at)}` : '';
    }

    console.log(`[FAMILY UI DISPLAY DECISION] userId=${item.user_id} statusText=${statusText}`);

    return (
      <View style={styles.listItem}>
        <View style={styles.listLeft}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <View>
            <Text style={styles.listName}>{item.profiles?.full_name || item.profiles?.email || 'Member'}</Text>
            {timeText ? <Text style={styles.listTime}>{timeText}</Text> : null}
          </View>
        </View>
        <View style={styles.listRight}>
          <Text style={[styles.statusText, { color: statusColor }]}>{statusText}</Text>
          {item.sharing_enabled && item.has_location && item.accuracy != null && (
            <Text style={styles.accuracyText}>±{Math.round(item.accuracy)}m</Text>
          )}
        </View>
      </View>
    );
  };

  console.log('[MAP RUNTIME] shouldShowNativeMap =', !!MapLibreGL);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <View style={{ flex: 1, paddingRight: 8 }}>
          <Text style={styles.title}>Family Live Map</Text>
          <Text style={styles.subtitle}>{family.family_name}</Text>
        </View>
        <View style={styles.toggleContainer}>
          <Text style={styles.toggleLabel}>Share my location</Text>
          <Switch value={sharingEnabled} onValueChange={handleToggleSharing} />
        </View>
      </View>
      <View style={styles.sharingNoticeContainer}>
        <Text style={styles.sharingNoticeText}>
          {sharingEnabled
            ? "Location sharing is ON. Your family can see your latest location."
            : "Location sharing is OFF. Your family will not see live updates unless Safe Window/SOS is active."}
        </Text>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#4F46E5" /></View>
      ) : errorMsg ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{errorMsg}</Text>
          <Text style={styles.retryText} onPress={fetchLocations}>Tap to retry</Text>
        </View>
      ) : (
        <>
          <View style={styles.mapContainer}>
            {MapLibreGL ? (() => {
              const plottableLocs = locations.filter(l => l.has_location && l.sharing_enabled && l.latitude != null && l.longitude != null);
              console.log('[FAMILY UI MARKERS]', plottableLocs.length);
              return (
              <View style={StyleSheet.absoluteFillObject}>
                <MapLibreGL.MapView
                  style={StyleSheet.absoluteFillObject}
                  styleURL="https://demotiles.maplibre.org/style.json"
                  logoEnabled={false}
                  attributionEnabled={true}
                  attributionPosition={{ bottom: 8, right: 8 }}
                >
                  <MapLibreGL.Camera
                    zoomLevel={12}
                    centerCoordinate={
                      plottableLocs.length > 0 
                      ? [plottableLocs[0].longitude!, plottableLocs[0].latitude!]
                      : [80.2707, 13.0827] // Chennai fallback
                    }
                  />
                  {plottableLocs.map(loc => (
                    <MapLibreGL.PointAnnotation
                      key={loc.id}
                      id={`marker-${loc.id}`}
                      coordinate={[loc.longitude!, loc.latitude!]}
                    >
                      <View style={[styles.markerView, { backgroundColor: getStatusColor(loc.status, loc.is_stale) }]} />
                    </MapLibreGL.PointAnnotation>
                  ))}
                </MapLibreGL.MapView>
                <View style={styles.osmAttribution}>
                  <Text style={styles.osmText}>© OpenStreetMap contributors (TODO: Add prod tiles)</Text>
                </View>
              </View>
              );
            })() : (() => {
              const fallbackReason = isExpoGo ? 'expo-go' : (!MapLibreGL ? 'maplibre-load-failed' : 'unknown');
              console.log('[MAP RUNTIME] fallbackReason =', fallbackReason);
              return (
                <View style={styles.mapFallback}>
                  <Text style={styles.fallbackText}>Map preview needs development build. Showing live location list.</Text>
                </View>
              );
            })()}
          </View>

          <View style={styles.listContainer}>
            <Text style={styles.listTitle}>Member Locations</Text>
            {locations.length === 0 ? (
              <Text style={styles.emptyText}>No members are currently sharing their location.</Text>
            ) : (
              <FlatList
                data={locations}
                keyExtractor={item => item.id}
                renderItem={renderListItem}
                contentContainerStyle={{ paddingBottom: 20 }}
              />
            )}
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FAFAF9' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  title: { fontSize: 20, fontWeight: 'bold', color: '#1E293B' },
  subtitle: { fontSize: 14, color: '#64748B' },
  toggleContainer: { alignItems: 'flex-end' },
  toggleLabel: { fontSize: 12, color: '#64748B', marginBottom: 4 },
  sharingNoticeContainer: { paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#F8FAFC', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  sharingNoticeText: { fontSize: 13, color: '#475569', fontStyle: 'italic', lineHeight: 18 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  mapContainer: { flex: 1, backgroundColor: '#E2E8F0', position: 'relative' },
  mapFallback: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  fallbackText: { color: '#64748B', textAlign: 'center', fontWeight: '500' },
  listContainer: { flex: 1, backgroundColor: 'white', padding: 16 },
  listTitle: { fontSize: 16, fontWeight: 'bold', color: '#1E293B', marginBottom: 12 },
  emptyText: { color: '#64748B', fontStyle: 'italic' },
  errorText: { color: '#DC2626', marginBottom: 12 },
  retryText: { color: '#4F46E5', fontWeight: 'bold', padding: 8 },
  listItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  listLeft: { flexDirection: 'row', alignItems: 'center' },
  statusDot: { width: 12, height: 12, borderRadius: 6, marginRight: 12 },
  listName: { fontSize: 16, fontWeight: '600', color: '#1E293B' },
  listTime: { fontSize: 12, color: '#64748B', marginTop: 2 },
  listRight: { alignItems: 'flex-end' },
  statusText: { fontSize: 12, fontWeight: 'bold' },
  accuracyText: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  markerView: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: 'white' },
  osmAttribution: { position: 'absolute', bottom: 4, left: 4, backgroundColor: 'rgba(255,255,255,0.7)', paddingHorizontal: 4, borderRadius: 4 },
  osmText: { fontSize: 10, color: '#333' }
});
