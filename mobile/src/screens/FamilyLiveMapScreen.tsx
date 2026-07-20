import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, Switch, Alert, ActivityIndicator, TouchableOpacity, Pressable, LayoutAnimation } from 'react-native';
import { StatusBar } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabaseClient';
import { familyLocationsApi } from '../api/familyLocations';
import { useFamily } from '../context/FamilyContext';
import { getCurrentLocationForAlert, getLastKnownLocation } from '../utils/location';
import { getMapStyleUrl } from '../config/MapConfig';
import { useMapProvider } from '../context/MapContext';
import { getUserColor } from '../utils/colorUtils';
import { apiClient } from '../api/client';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import BottomSheet, { BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import SOSSafetyModal from '../components/SOSSafetyModal';
import { NearbyRespondersList } from '../components/NearbyRespondersList';

const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

const SHARING_PREF_KEY = '@safeher_location_sharing_enabled';

let MapLibreGL: any = null;
if (!isExpoGo) {
  try {
    const mapLibreModule = require('@maplibre/maplibre-react-native');
    MapLibreGL = mapLibreModule.default ?? mapLibreModule;
  } catch (e) {
    console.warn('MapLibreGL initialization failed:', e instanceof Error ? e.message : String(e));
  }
}

export const getStatusColor = (status: string, isStale?: boolean) => {
  if (isStale) return '#94A3B8';
  switch (status) {
    case 'SOS_ACTIVE':
      return '#DC2626';
    case 'SAFE':
      return '#22C55E';
    case 'OFFLINE':
      return '#94A3B8';
    case 'UNKNOWN':
    default:
      return '#F59E0B';
  }
};

const formatTime = (dateString: string) => {
  try {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    return '';
  }
};

export default function FamilyLiveMapScreen() {
  const { family, refresh } = useFamily();
  const [locations, setLocations] = useState<any[]>([]);
  const [mapZoom, setMapZoom] = useState(17);
  const [sharingEnabled, setSharingEnabled] = useState(false);
  const { mapStyleId } = useMapProvider();
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [safetySummary, setSafetySummary] = useState<any>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [showSOSModal, setShowSOSModal] = useState(false);
  
  const [defaultCenterCoordinate, setDefaultCenterCoordinate] = useState<[number, number]>([77.0272806, 11.0283256]); // TN Default
  
  const [nearbyRespondersData, setNearbyRespondersData] = useState<any>(null);
  const [respondersLoading, setRespondersLoading] = useState(false);
  const respondersAbortRef = useRef<AbortController | null>(null);

  const currentUserIdRef = useRef<string | null>(null);
  const currentFamilyIdRef = useRef<string | null>(null);
  const fetchInFlightRef = useRef(false);
  const safetySummaryAbortRef = useRef<AbortController | null>(null);
  const bottomSheetRef = useRef<BottomSheet>(null);
  const mapRef = useRef<any>(null);
  const toggleTimestampRef = useRef<number>(0);
  const cameraPositionRef = useRef<{ center: [number, number]; zoom: number } | null>(null);
  // Track whether sharing was restored from AsyncStorage on mount (not toggled by user)
  const sharingRestoredOnMount = useRef(false);

  const snapPoints = useMemo(() => ['15%', '60%'], []);

  useEffect(() => {
    const initLocation = async () => {
      try {
        const stored = await AsyncStorage.getItem(SHARING_PREF_KEY);
        if (stored === 'true') {
          setSharingEnabled(true);
          // Mark that sharing was restored from storage so we can auto-start it
          // once myUserId and family refs are populated (see useEffect below).
          sharingRestoredOnMount.current = true;
        }

        const lastLoc = await getLastKnownLocation();
        if (lastLoc && !lastLoc.permissionDenied && lastLoc.latitude && lastLoc.longitude) {
          const center: [number, number] = [lastLoc.longitude, lastLoc.latitude];
          setDefaultCenterCoordinate(center);
          if (!cameraPositionRef.current) {
            cameraPositionRef.current = { center, zoom: 17 };
          }
        }
        
        const gpsLoc = await getCurrentLocationForAlert(true);
        if (gpsLoc && !gpsLoc.permissionDenied && gpsLoc.latitude && gpsLoc.longitude) {
          const center: [number, number] = [gpsLoc.longitude, gpsLoc.latitude];
          setDefaultCenterCoordinate(center);
          if (!cameraPositionRef.current) {
            cameraPositionRef.current = { center, zoom: 17 };
          }
        }
      } catch (e) {
        console.warn('[FamilyMap] Failed to get initial GPS location, using default center', e);
      }
    };
    initLocation();

    supabase.auth.getSession().then(({ data }) => {
      if (data?.session) {
        const userId = data.session.user.id;
        setMyUserId(userId);
        currentUserIdRef.current = userId;
      }
    });

    const { data: authSub } = supabase.auth.onAuthStateChange((_event, session) => {
      const newUserId = session?.user?.id ?? null;
      const oldUserId = currentUserIdRef.current;

      if (newUserId !== oldUserId) {
        currentUserIdRef.current = newUserId;
        setMyUserId(newUserId);
        setLocations([]);
        setErrorMsg(null);
        setLoading(true);
        currentFamilyIdRef.current = null;
        setSafetySummary(null);
        setNearbyRespondersData(null);
      }
    });

    return () => {
      authSub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const newFamilyId = family?.id ?? null;
    const oldFamilyId = currentFamilyIdRef.current;

    if (newFamilyId !== oldFamilyId) {
      currentFamilyIdRef.current = newFamilyId;
      
      if (oldFamilyId !== null) {
        setLocations([]);
        setErrorMsg(null);
        setLoading(true);
        setSafetySummary(null);
        setNearbyRespondersData(null);
      }

      if (family) {
        fetchLocations(myUserId);
      }
    }
  }, [family]);

  useEffect(() => {
    if (myUserId && locations.length > 0) {
      const myLoc = locations.find(l => l.user_id === myUserId);
      if (myLoc) {
        const fetchAge = (locations as any).__fetchStartTime ?? 0;
        if (fetchAge < toggleTimestampRef.current) return;
        setSharingEnabled(myLoc.sharing_enabled);
      }
    }
  }, [locations, myUserId]);

  useEffect(() => {
    if (family) {
      fetchSafetySummary();
      fetchNearbyResponders();
    }
  }, [family?.id]);

  // Immediately sync location sharing when restored from AsyncStorage.
  // initLocation() runs before auth session resolves, so myUserId / family.id
  // are not yet set at that point. This effect fires once all three are ready.
  useEffect(() => {
    if (!sharingRestoredOnMount.current) return;
    if (!myUserId || !family) return;
    // Only fire once — clear the flag after first trigger
    sharingRestoredOnMount.current = false;
    const syncRestoredSharing = async () => {
      try {
        await familyLocationsApi.toggleSharing(true);
        await updateMyLocation();
        await fetchLocations(myUserId);
      } catch (e) {
        console.warn('[FamilyMap] Failed to sync restored sharing state', e);
      }
    };
    syncRestoredSharing();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myUserId, family?.id]);

  const fetchSafetySummary = async () => {
    if (!family) return;
    const userId = currentUserIdRef.current;
    
    if (safetySummaryAbortRef.current) {
      safetySummaryAbortRef.current.abort();
    }
    
    const abortController = new AbortController();
    safetySummaryAbortRef.current = abortController;
    
    setSummaryLoading(true);
    try {
      const res = await apiClient.get('/api/safety/summary');
      setSafetySummary(res.data);
    } catch (e: any) {
      if (e.name !== 'CanceledError') {
        console.warn('[SAFETY SUMMARY ERROR]', e);
      }
    } finally {
      setSummaryLoading(false);
    }
  };

  const fetchNearbyResponders = async () => {
    if (!family) return;
    
    if (respondersAbortRef.current) {
      respondersAbortRef.current.abort();
    }
    
    const abortController = new AbortController();
    respondersAbortRef.current = abortController;
    
    setRespondersLoading(true);
    try {
      const data = await familyLocationsApi.getNearbyResponders(family.id);
      setNearbyRespondersData(data);
    } catch (e: any) {
      if (e.name !== 'CanceledError') {
        console.warn('[NEARBY RESPONDERS ERROR]', e);
      }
    } finally {
      setRespondersLoading(false);
    }
  };

  useEffect(() => {
    if (!family) return;

    const dbChannel = supabase
      .channel('family_locations_db_updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'family_member_locations', filter: `family_id=eq.${family.id}` }, (payload) => {
        let needsFetch = false;
        setLocations(currentLocations => {
          const newRow = payload.new as any;
          if (payload.eventType === 'UPDATE' && newRow?.user_id) {
             const exists = currentLocations.some(l => l.user_id === newRow.user_id);
             if (exists) {
                return currentLocations.map(l => 
                  l.user_id === newRow.user_id 
                    ? { 
                        ...l, 
                        latitude: newRow.latitude, 
                        longitude: newRow.longitude, 
                        accuracy: newRow.accuracy, 
                        status: newRow.status, 
                        sharing_enabled: newRow.sharing_enabled, 
                        updated_at: newRow.updated_at,
                        has_location: true,
                        is_stale: false 
                      } 
                    : l
                );
             }
          }
          needsFetch = true;
          return currentLocations;
        });

        if (needsFetch && myUserId) setTimeout(() => fetchLocations(myUserId), 0);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          fetchLocations(myUserId);
          fetchNearbyResponders();
        }
      });
      
    const broadcastChannel = supabase
      .channel(`family:${family.id}`)
      .on('broadcast', { event: 'location' }, (payload) => {
        const { user_id, latitude, longitude, accuracy, status } = payload.payload;
        if (!user_id || !latitude || !longitude) return;
        
        setLocations(currentLocations => {
          const exists = currentLocations.some(l => l.user_id === user_id);
          if (exists) {
            return currentLocations.map(l => 
              l.user_id === user_id 
                ? { 
                    ...l, 
                    latitude, 
                    longitude, 
                    accuracy, 
                    status: status || l.status,
                    has_location: true,
                    is_stale: false,
                    updated_at: new Date().toISOString()
                  } 
                : l
            );
          }
          return currentLocations;
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(dbChannel);
      supabase.removeChannel(broadcastChannel);
    };
  }, [family?.id, myUserId]);

  useEffect(() => {
    const sweepInterval = setInterval(() => {
      setLocations(currentLocations => {
        let changed = false;
        const now = Date.now();
        const staleThreshold = 15 * 60 * 1000;

        const updated = currentLocations.map(loc => {
          if (!loc.updated_at) return loc;
          const dt = new Date(loc.updated_at).getTime();
          const isStale = (now - dt) > staleThreshold;
          
          if (isStale && (!loc.is_stale || loc.status !== 'OFFLINE')) {
            changed = true;
            return { ...loc, status: 'OFFLINE' as any, is_stale: true };
          }
          if (!isStale && loc.is_stale) {
             changed = true;
             return { ...loc, is_stale: false };
          }
          return loc;
        });

        return changed ? updated : currentLocations;
      });
    }, 30000);
    return () => clearInterval(sweepInterval);
  }, []);

  const fetchLocations = async (userId: string | null) => {
    if (!family) return;
    const familyId = family.id;
    const fetchStartTime = Date.now();

    if (fetchInFlightRef.current) return;
    fetchInFlightRef.current = true;

    try {
      setErrorMsg(null);
      const data = await familyLocationsApi.getLocations(familyId);
      
      if (currentFamilyIdRef.current === familyId) {
        (data as any).__fetchStartTime = fetchStartTime;
        setLocations(data);
        setErrorMsg(null);
      }
    } catch (e: any) {
      console.warn('Failed to fetch family locations', e);
      if (e?.response?.status === 403) {
        setLocations([]);
        setErrorMsg(null);
        setLoading(true);
        currentFamilyIdRef.current = null;
        setTimeout(() => refresh(), 300);
      } else if (e?.response?.status === 500) {
        setErrorMsg('Live location table is not ready. Please run the latest migration.');
      } else {
        setErrorMsg('Could not load family locations. Please try again.');
      }
    } finally {
      setLoading(false);
      fetchInFlightRef.current = false;
    }
  };

  const updateMyLocation = async () => {
    const userId = currentUserIdRef.current;
    const familyId = currentFamilyIdRef.current;
    if (!userId || !familyId) return;
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
    toggleTimestampRef.current = Date.now();
    setSharingEnabled(val);
    AsyncStorage.setItem(SHARING_PREF_KEY, val ? 'true' : 'false').catch((e) => console.warn('[FamilyMap] Failed to persist sharing preference', e));
    try {
      await familyLocationsApi.toggleSharing(val);
      if (val) {
        await updateMyLocation();
        await fetchLocations(myUserId);
      }
    } catch (e) {
      Alert.alert('Error', 'Could not update sharing preference.');
      setSharingEnabled(!val);
      AsyncStorage.setItem(SHARING_PREF_KEY, val ? 'false' : 'true').catch((e) => console.warn('[FamilyMap] Failed to revert sharing preference', e));
    }
  };

  const handleMemberTap = useCallback((member: any) => {
    bottomSheetRef.current?.snapToIndex(0);
  }, []);

  const renderListItem = useCallback(({ item }: { item: any }) => {
    const isMe = item.user_id === myUserId;
    const isSOS = item.status === 'SOS_ACTIVE';
    const isOffline = item.status === 'OFFLINE' || item.is_stale;
    
    const statusColor = getUserColor(item.user_id, isMe, isSOS, isOffline);

    let statusText = item.status.replace('_', ' ');
    let timeText = '';

    if (!item.sharing_enabled) {
      statusText = 'SHARING OFF';
    } else if (!item.has_location) {
      statusText = 'NO LOCATION YET';
    } else if (isOffline) {
      statusText = 'OFFLINE';
      timeText = item.updated_at ? `Last seen: ${formatTime(item.updated_at)}` : '';
    } else {
      timeText = item.updated_at ? `Updated: ${formatTime(item.updated_at)}` : '';
    }

    return (
      <Pressable 
        style={styles.listItem} 
        onPress={() => handleMemberTap(item)}
      >
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
      </Pressable>
    );
  }, [handleMemberTap]);

  const hasActiveSOS = safetySummary?.sos_active || false;

  if (!family) {
    return (
      <View style={styles.container}>
        <View style={styles.center}><Text>No family selected.</Text></View>
      </View>
    );
  }


  return (
    <GestureHandlerRootView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      
      {/* FULL SCREEN MAP */}
      <View style={StyleSheet.absoluteFillObject}>
        {loading ? (
          <View style={[styles.center, { backgroundColor: '#E2E8F0' }]}>
            <ActivityIndicator size="large" color="#4F46E5" />
          </View>
        ) : errorMsg ? (
          <View style={[styles.center, { backgroundColor: '#E2E8F0' }]}>
            <Text style={styles.errorText}>{errorMsg}</Text>
            <Text style={styles.retryText} onPress={() => myUserId && fetchLocations(myUserId)}>Tap to retry</Text>
          </View>
        ) : (() => {
          const plottableLocs = locations.filter(l => l.has_location && l.sharing_enabled && l.latitude != null && l.longitude != null);
          
          // Use stable camera position — derived once on mount from GPS, never
          // re-derived from the locations array so Realtime updates don't jump the camera.
          const myLoc = plottableLocs.find(l => l.user_id === myUserId);
          if (!cameraPositionRef.current) {
            // First render with data: seed camera from my location or first member.
            const seedLoc = myLoc || plottableLocs[0];
            cameraPositionRef.current = {
              center: seedLoc
                ? [seedLoc.longitude!, seedLoc.latitude!]
                : defaultCenterCoordinate,
              zoom: mapZoom,
            };
          }
          const stableCamera = cameraPositionRef.current;
          
          if (isExpoGo || !MapLibreGL) {
            return (
              <View style={styles.mapFallback}>
                <Text style={styles.fallbackText}>Map requires native build.</Text>
              </View>
            );
          }

          const MapComponent = MapLibreGL.Map;
          const CameraComponent = MapLibreGL.Camera;
          const MarkerComp = MapLibreGL.Marker;
          const CalloutComp = MapLibreGL.Callout;

          // Inner component to handle smooth animation for each marker independently
          const AnimatedFamilyMarker = ({ loc, MapLibreGL }: { loc: any, MapLibreGL: any }) => {
            const [animLoc, setAnimLoc] = useState({ lat: loc.latitude, lon: loc.longitude });
            const isMe = loc.user_id === myUserId;
            const isSOS = loc.status === 'SOS';
            const isOffline = loc.status === 'OFFLINE' || loc.is_stale;
            const markerColor = getUserColor(loc.user_id, isMe, isSOS, isOffline);
            const userName = loc.profiles?.full_name || loc.profiles?.email || 'Unknown User';

            useEffect(() => {
              const startLoc = animLoc;
              const endLoc = { lat: loc.latitude, lon: loc.longitude };
              const dist = Math.sqrt(Math.pow(endLoc.lat - startLoc.lat, 2) + Math.pow(endLoc.lon - startLoc.lon, 2));
              
              if (dist < 0.000001 || dist > 0.01) {
                setAnimLoc(endLoc);
                return;
              }

              let startTime = 0;
              const duration = 1000;
              const animate = (time: number) => {
                if (!startTime) startTime = time;
                const progress = Math.min((time - startTime) / duration, 1);
                const ease = 1 - Math.pow(1 - progress, 3);
                setAnimLoc({
                  lat: startLoc.lat + (endLoc.lat - startLoc.lat) * ease,
                  lon: startLoc.lon + (endLoc.lon - startLoc.lon) * ease,
                });
                if (progress < 1) requestAnimationFrame(animate);
              };
              const rafId = requestAnimationFrame(animate);
              return () => cancelAnimationFrame(rafId);
            }, [loc.latitude, loc.longitude]);

            return (
              <MapLibreGL.Marker
                id={`family-marker-${loc.user_id}`}
                lngLat={[animLoc.lon, animLoc.lat]}
                anchor="center"
              >
                <View style={[styles.markerView, { backgroundColor: markerColor }]}>
                  <View style={styles.markerInnerDot} />
                </View>
                <MapLibreGL.Callout title={userName} />
              </MapLibreGL.Marker>
            );
          };

          return (
            <MapComponent
              style={StyleSheet.absoluteFillObject}
              mapStyle={getMapStyleUrl(mapStyleId)}
              logo={false}
              attribution={true}
              attributionPosition={{ bottom: 8, right: 8 }}
            >
              <CameraComponent
                zoom={stableCamera.zoom}
                center={stableCamera.center}
                duration={0}
              />
              {plottableLocs.map(loc => (
                <AnimatedFamilyMarker key={loc.user_id} loc={loc} MapLibreGL={MapLibreGL} />
              ))}
            </MapComponent>
          );
        })()}

        {/* Zoom controls */}
        {locations.some(l => l.has_location && l.sharing_enabled) && (
          <View style={styles.zoomControls}>
            <TouchableOpacity style={styles.zoomButton} onPress={() => {
              const next = Math.min(19, mapZoom + 1);
              setMapZoom(next);
              if (cameraPositionRef.current) cameraPositionRef.current = { ...cameraPositionRef.current, zoom: next };
            }}>
              <Text style={styles.zoomButtonText}>+</Text>
            </TouchableOpacity>
            <View style={styles.zoomDivider} />
            <TouchableOpacity style={styles.zoomButton} onPress={() => {
              const next = Math.max(12, mapZoom - 1);
              setMapZoom(next);
              if (cameraPositionRef.current) cameraPositionRef.current = { ...cameraPositionRef.current, zoom: next };
            }}>
              <Text style={styles.zoomButtonText}>−</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* My Location button — the only action that re-centers the camera */}
        {locations.some(l => l.has_location && l.sharing_enabled) && (
          <TouchableOpacity
            style={styles.myLocationButton}
            onPress={async () => {
              try {
                const loc = await getCurrentLocationForAlert(true);
                if (loc && !loc.permissionDenied && loc.latitude && loc.longitude) {
                  const center: [number, number] = [loc.longitude, loc.latitude];
                  cameraPositionRef.current = { center, zoom: 17 };
                  setMapZoom(17);
                  setDefaultCenterCoordinate(center); // triggers re-render to apply new camera
                }
              } catch (e) { console.warn('[FamilyMap] Failed to get current location for re-center', e); }
            }}
          >
            <Text style={styles.myLocationButtonText}>◎</Text>
          </TouchableOpacity>
        )}

        {/* OSM Attribution */}
        {locations.some(l => l.has_location && l.sharing_enabled) && (
          <View style={styles.osmAttribution}>
            <Text style={styles.osmText}>© OpenStreetMap / Google contributors</Text>
          </View>
        )}
      </View>

      {/* FLOATING TRANSLUCENT HEADER */}
      <View style={styles.floatingHeader}>
        <View style={styles.headerContent}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Family Live Map</Text>
            <Text style={styles.headerSubtitle}>{family.family_name}</Text>
          </View>
          <View style={styles.shareToggle}>
            <Switch 
              value={sharingEnabled} 
              onValueChange={handleToggleSharing}
              trackColor={{ false: '#CBD5E1', true: '#818CF8' }}
              thumbColor={sharingEnabled ? '#4F46E5' : '#F1F5F9'}
            />
            <Text style={styles.shareLabel}>Share location</Text>
          </View>
        </View>
      </View>

      {/* SOS ACTIVE BANNER */}
      {hasActiveSOS && (
        <Pressable 
          style={styles.sosBanner}
          onPress={() => setShowSOSModal(true)}
        >
          <View style={styles.sosBannerContent}>
            <View style={styles.sosPulse} />
            <Text style={styles.sosBannerText}>🚨 SOS ACTIVE</Text>
            <Text style={styles.sosBannerAction}>Tap for details →</Text>
          </View>
        </Pressable>
      )}

      {/* DRAGGABLE BOTTOM SHEET - MEMBER LOCATIONS */}
      <BottomSheet
        ref={bottomSheetRef}
        index={0}
        snapPoints={snapPoints}
        enablePanDownToClose={false}
        backgroundStyle={styles.bottomSheetBackground}
        handleIndicatorStyle={styles.bottomSheetIndicator}
      >
        <View style={styles.bottomSheetHeader}>
          <Text style={styles.bottomSheetTitle}>Member Locations</Text>
          <Text style={styles.memberCount}>{locations.length} members</Text>
        </View>

        <NearbyRespondersList 
          responders={nearbyRespondersData?.responders || []}
          loading={respondersLoading}
          sharingEnabled={sharingEnabled}
        />
        
        <BottomSheetFlatList
          data={locations}
          keyExtractor={item => item.id}
          renderItem={renderListItem}
          contentContainerStyle={styles.bottomSheetList}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No members are currently sharing their location.</Text>
            </View>
          }
        />
      </BottomSheet>

      {/* SOS SAFETY MODAL */}
      <SOSSafetyModal
        visible={showSOSModal}
        onClose={() => setShowSOSModal(false)}
        safetySummary={safetySummary}
        loading={summaryLoading}
      />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  
  // Floating Header
  floatingHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 50, // Account for status bar
    zIndex: 10,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1E293B',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  shareToggle: {
    alignItems: 'center',
    gap: 4,
  },
  shareLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },

  // SOS Banner
  sosBanner: {
    position: 'absolute',
    top: 130, // Below header
    left: 16,
    right: 16,
    zIndex: 9,
  },
  sosBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#DC2626',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  sosPulse: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#FEE2E2',
    marginRight: 8,
  },
  sosBannerText: {
    flex: 1,
    fontSize: 16,
    fontWeight: 'bold',
    color: 'white',
  },
  sosBannerAction: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '600',
  },

  // Map
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
  errorText: {
    color: '#DC2626',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 12,
  },
  retryText: {
    color: '#4F46E5',
    fontWeight: 'bold',
    fontSize: 15,
    padding: 12,
  },

  // Map Controls
  zoomControls: {
    position: 'absolute',
    right: 16,
    bottom: '20%', // Above bottom sheet
    backgroundColor: 'white',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
    overflow: 'hidden',
  },
  zoomButton: {
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  zoomButtonText: {
    fontSize: 24,
    fontWeight: '600',
    color: '#1E293B',
  },
  zoomDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
  },
  osmAttribution: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  osmText: {
    fontSize: 9,
    color: '#64748B',
  },
  myLocationButton: {
    position: 'absolute',
    right: 16,
    bottom: '28%', // sits above the zoom control block
    backgroundColor: 'white',
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  myLocationButtonText: {
    fontSize: 22,
    color: '#4F46E5',
    fontWeight: '600',
  },

  // Markers
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

  // Bottom Sheet
  bottomSheetBackground: {
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  bottomSheetIndicator: {
    backgroundColor: '#CBD5E1',
    width: 40,
  },
  bottomSheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  bottomSheetTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1E293B',
  },
  memberCount: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
  },
  bottomSheetList: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },

  // List Items
  listItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  listLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 12,
  },
  listName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E293B',
  },
  listTime: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
  },
  listRight: {
    alignItems: 'flex-end',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  accuracyText: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  emptyContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#64748B',
    fontStyle: 'italic',
    textAlign: 'center',
  },
});
