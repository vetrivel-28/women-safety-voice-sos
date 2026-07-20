import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useState, useEffect, useRef } from 'react';
import { 
  View, Text, StyleSheet, ScrollView, Platform, TouchableOpacity, 
  KeyboardAvoidingView, Alert, Animated, useColorScheme 
} from 'react-native';
import { useSafeWindow } from '../context/SafeWindowContext';
import { PrimaryButton } from '../components/PrimaryButton';
import { SectionHeader } from '../components/SectionHeader';
import { getCurrentLocationForAlert } from '../utils/location';
import { reverseGeocode, PlaceResult } from '../services/geocodingService';
import { distanceBetweenPointsMeters } from '../utils/geoUtils';
import { trustedPlacesApi } from '../api/trustedPlaces';
import { TrustedPlace, TRUSTED_PLACE_LABEL_ICONS, TrustedPlaceLabel } from '../types';
import TrustedPlacesScreen from './TrustedPlacesScreen';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import MapRouteLayer from '../components/map/MapRouteLayer';

// ── Material 3 Theme Tokens ───────────────────────────────────────────────
const createTheme = (isDark: boolean) => ({
  background: isDark ? '#121212' : '#F8FAFC',
  surface: isDark ? '#1E1E1E' : '#FFFFFF',
  surfaceVariant: isDark ? '#2C2C2C' : '#F1F5F9',
  onSurface: isDark ? '#E2E8F0' : '#0F172A',
  onSurfaceVariant: isDark ? '#94A3B8' : '#64748B',
  primary: isDark ? '#818CF8' : '#4F46E5',
  primaryContainer: isDark ? '#3730A3' : '#EEF2FF',
  onPrimaryContainer: isDark ? '#E0E7FF' : '#3730A3',
  error: isDark ? '#F87171' : '#EF4444',
  errorContainer: isDark ? '#7F1D1D' : '#FEF2F2',
  onErrorContainer: isDark ? '#FECACA' : '#991B1B',
  warning: isDark ? '#FBBF24' : '#F59E0B',
  success: isDark ? '#34D399' : '#10B981',
  successContainer: isDark ? '#064E3B' : '#D1FAE5',
  onSuccessContainer: isDark ? '#6EE7B7' : '#065F46',
  border: isDark ? '#333333' : '#E2E8F0',
});

// ── Shared Skeleton Component ─────────────────────────────────────────────
const SkeletonPulse = ({ style, isDark }: { style: any, isDark: boolean }) => {
  const anim = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.4, duration: 800, useNativeDriver: true })
      ])
    ).start();
  }, []);
  return (
    <Animated.View style={[
      style, 
      { opacity: anim, backgroundColor: isDark ? '#2C2C2C' : '#E2E8F0' }
    ]} />
  );
};

export const SafeWindowScreen: React.FC = () => {
  const { 
    safeWindow, startSafeWindow, endSafeWindow, getRemainingSeconds, 
    getCheckInRemainingSeconds, markCheckInSafe, resumeRoute, 
    cancelDeviationWarning, batteryOptimizationDenied, openBatterySettings, 
    isStartingJourney, showArrivalModal, closeArrivalModal, 
    currentLocation, distanceToDestination 
  } = useSafeWindow();
  
  const route = useRoute<RouteProp<RootStackParamList, 'SafeWindow'>>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  
  const isDark = useColorScheme() === 'dark';
  const theme = createTheme(isDark);

  const [timeLeft, setTimeLeft] = useState(getRemainingSeconds());
  const [checkInTimeLeft, setCheckInTimeLeft] = useState(getCheckInRemainingSeconds());
  const [warningTimeLeft, setWarningTimeLeft] = useState(0);
  
  const CHECKIN_OPTIONS = [3, 5, 10] as const;
  const [checkInMinutes, setCheckInMinutes] = useState<3 | 5 | 10>(5);
  
  const [useCurrentLocation, setUseCurrentLocation] = useState(true);
  const [startPlace, setStartPlace] = useState<PlaceResult | null>(null);
  const [destPlace, setDestPlace] = useState<PlaceResult | null>(null);
  
  const [isStarting, setIsStarting] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  // ── Trusted places state ──────────────────────────────────────────────────
  const [trustedPlaces, setTrustedPlaces] = useState<TrustedPlace[]>([]);
  const [selectedTrustedPlace, setSelectedTrustedPlace] = useState<TrustedPlace | null>(null);
  const [showTrustedPlacesPicker, setShowTrustedPlacesPicker] = useState(false);
  const [isLoadingTp, setIsLoadingTp] = useState(true);

  const loadTrustedPlaces = () => {
    setIsLoadingTp(true);
    trustedPlacesApi.list()
      .then(data => setTrustedPlaces(data))
      .catch((err) => console.error('[TrustedPlaces] load failed:', err))
      .finally(() => setIsLoadingTp(false));
  };

  useEffect(() => {
    loadTrustedPlaces();
  }, []);

  useEffect(() => {
    if (route.params?.pickedLocation) {
      const picked = route.params.pickedLocation;
      if (picked.type === 'from') {
        setStartPlace({
          id: Math.random().toString(),
          name: picked.address,
          description: picked.address,
          latitude: picked.latitude,
          longitude: picked.longitude,
          provider: 'map_picker'
        });
        setUseCurrentLocation(false);
      } else if (picked.type === 'to') {
        setDestPlace({
          id: Math.random().toString(),
          name: picked.address,
          description: picked.address,
          latitude: picked.latitude,
          longitude: picked.longitude,
          provider: 'map_picker'
        });
        setSelectedTrustedPlace(null);
      }
      navigation.setParams({ pickedLocation: undefined });
    }
  }, [route.params?.pickedLocation, navigation]);

  const [isSavingTp, setIsSavingTp] = useState(false);
  const handleQuickSaveTp = async () => {
    if (!destPlace || !destPlace.latitude || !destPlace.longitude) return;
    setIsSavingTp(true);
    try {
      await trustedPlacesApi.create({
        name: destPlace.name,
        latitude: destPlace.latitude,
        longitude: destPlace.longitude,
        address: destPlace.description || destPlace.name,
        radius_meters: 100,
        notify_guardians_on_arrival: true
      });
      loadTrustedPlaces();
      Alert.alert('Success', 'Saved as a trusted place!');
    } catch(e) {
      Alert.alert('Error', 'Could not save trusted place.');
    } finally {
      setIsSavingTp(false);
    }
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (safeWindow.status === 'ACTIVE' || safeWindow.status === 'MISSED_CHECKIN') {
      setTimeLeft(getRemainingSeconds());
      setCheckInTimeLeft(getCheckInRemainingSeconds());
      
      interval = setInterval(() => {
        setTimeLeft(getRemainingSeconds());
        setCheckInTimeLeft(getCheckInRemainingSeconds());
        if (safeWindow.routeDeviationWarningAt && !safeWindow.routeDeviationDetected) {
          const now = new Date().getTime();
          const warningTime = new Date(safeWindow.routeDeviationWarningAt).getTime();
          const elapsed = Math.floor((now - warningTime) / 1000);
          setWarningTimeLeft(Math.max(0, 60 - elapsed));
        }
      }, 1000);
    } else {
      setTimeLeft(0);
      setCheckInTimeLeft(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [safeWindow.status, safeWindow.endsAt, safeWindow.checkInDueAt, getRemainingSeconds, getCheckInRemainingSeconds, safeWindow.routeDeviationWarningAt, safeWindow.routeDeviationDetected]);

  const isWithinTamilNadu = (lat: number, lon: number): boolean => {
    return lat >= 8.0 && lat <= 13.6 && lon >= 76.0 && lon <= 80.4;
  };

  const clearSelection = (type: 'from' | 'to') => {
    if (type === 'to') {
      setDestPlace(null);
    } else {
      setStartPlace(null);
    }
  };

  const handleStart = async (minutes: 15|30|60|0.5, forceStart: boolean = false) => {
    try {
      console.log(`[SafeWindow] handleStart triggered with minutes=${minutes}, forceStart=${forceStart}`);
      setIsStarting(true);
      setErrorBanner(null);
      
      let startLoc, destLoc;
      
      if (useCurrentLocation) {
        console.log('[SafeWindow] Using current location for start.');
        const locData = await getCurrentLocationForAlert(true);
        if (!locData || locData.permissionDenied || !locData.latitude || !locData.longitude) {
          setErrorBanner('Could not fetch current location.');
          setIsStarting(false);
          return;
        }
        startLoc = { latitude: locData.latitude, longitude: locData.longitude, address: "Current Location" };
      } else {
        console.log('[SafeWindow] Using chosen start location:', startPlace);
        if (!startPlace || !startPlace.latitude || !startPlace.longitude) {
          setErrorBanner('Please select a valid start location.');
          setIsStarting(false);
          return;
        }
        startLoc = { latitude: startPlace.latitude!, longitude: startPlace.longitude!, address: startPlace.name, placeId: startPlace.id, provider: startPlace.provider };
      }
      
      if (destPlace) {
        console.log('[SafeWindow] Using chosen destination:', destPlace);
        if (!destPlace.latitude || !destPlace.longitude) {
           setErrorBanner('Invalid destination location.');
           setIsStarting(false);
           return;
        }
        destLoc = { latitude: destPlace.latitude!, longitude: destPlace.longitude!, address: destPlace.name, placeId: destPlace.id, provider: destPlace.provider };
      } else if (selectedTrustedPlace) {
        console.log('[SafeWindow] Using Trusted Place destination:', selectedTrustedPlace);
        destLoc = { 
          latitude: selectedTrustedPlace.latitude, 
          longitude: selectedTrustedPlace.longitude, 
          address: selectedTrustedPlace.address || selectedTrustedPlace.name 
        };
      } else {
        setErrorBanner('Please select a destination.');
        setIsStarting(false);
        return;
      }

      if (destLoc && !forceStart && startLoc && startLoc.latitude && startLoc.longitude && destLoc.latitude && destLoc.longitude) {
        const dist = distanceBetweenPointsMeters(startLoc.latitude, startLoc.longitude, destLoc.latitude, destLoc.longitude);
        if (dist > 100000) {
          setErrorBanner("Destination is too far away (> 100km).");
          setIsStarting(false);
          Alert.alert(
            "Far Destination",
            "Destination is over 100km away. Do you want to start anyway?",
            [
              { text: "Choose another destination", style: "cancel" },
              { text: "Start anyway", onPress: () => handleStart(minutes, true) }
            ]
          );
          return;
        }
      }

      console.log(`[SafeWindow] Starting journey: ${startLoc.latitude},${startLoc.longitude} -> ${destLoc.latitude},${destLoc.longitude}`);
      await startSafeWindow(minutes, checkInMinutes, startLoc, destLoc, selectedTrustedPlace);
      console.log('[SafeWindow] Journey successfully started.');
    } catch (e: any) {
      console.error('[SafeWindow] handleStart crashed:', e, e?.stack);
      setErrorBanner(e.message || 'Failed to start Safe Window. Please try again.');
    } finally {
      setIsStarting(false);
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };


  const [isCompleting, setIsCompleting] = useState(false);
  const [isCheckingIn, setIsCheckingIn] = useState(false);

  const handleCheckIn = async () => {
    setIsCheckingIn(true);
    await markCheckInSafe();
    setIsCheckingIn(false);
  };

  const handleEnd = async () => {
    setIsCompleting(true);
    await endSafeWindow();
    setIsCompleting(false);
  };

  const calculateRiskScore = () => {
    if (safeWindow.status === 'MISSED_CHECKIN') return 'HIGH';
    if (safeWindow.routeDeviationDetected) return 'HIGH';
    return 'LOW';
  };

  const riskScore = calculateRiskScore();

  // ── ACTIVE JOURNEY UI ─────────────────────────────────────────────────────
  if (safeWindow.status === 'ACTIVE' || safeWindow.status === 'MISSED_CHECKIN') {
    const isMissed = safeWindow.status === 'MISSED_CHECKIN';
    const etaMinutes = distanceToDestination != null
      ? Math.max(1, Math.round(distanceToDestination / 1000 / 0.5)) // Assuming 30km/h avg speed (0.5km/min)
      : (safeWindow.estimated_duration_minutes || null);
    const distKm = distanceToDestination != null
      ? (distanceToDestination / 1000).toFixed(1)
      : (safeWindow.distance_km?.toFixed(1) || null);
    
    const progressPercent = safeWindow.distance_km && distKm 
      ? Math.min(100, Math.max(0, 100 - (parseFloat(distKm) / safeWindow.distance_km * 100))) 
      : 0;

    return (
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        <MapRouteLayer
          routePoints={safeWindow.routePoints}
          currentLocation={currentLocation}
          startLocation={safeWindow.startLocation ? { lat: safeWindow.startLocation.latitude, lon: safeWindow.startLocation.longitude } : null}
          destinationLocation={safeWindow.destinationLocation ? { lat: safeWindow.destinationLocation.latitude, lon: safeWindow.destinationLocation.longitude } : null}
        />

        {/* Top Status Card */}
        <SafeAreaView style={journeyStyles.topContainer} pointerEvents="box-none">
          <View style={[journeyStyles.statusCard, { backgroundColor: theme.surface, shadowColor: isDark ? '#000' : '#CBD5E1' }]}>
            <View style={journeyStyles.statusHeader}>
              <View style={[journeyStyles.pulseDot, { backgroundColor: isMissed ? theme.error : theme.success }]} />
              <Text style={[journeyStyles.statusTitle, { color: isMissed ? theme.error : theme.onSurface }]}>
                {isMissed ? 'MISSED CHECK-IN' : 'JOURNEY ACTIVE'}
              </Text>
            </View>
            
            {/* Destination Info */}
            <View style={journeyStyles.destRow}>
              <Text style={{fontSize: 20, marginRight: 8}}>📍</Text>
              <View style={{ flex: 1 }}>
                <Text style={[journeyStyles.destLabel, { color: theme.onSurfaceVariant }]}>Heading to</Text>
                <Text style={[journeyStyles.destName, { color: theme.onSurface }]} numberOfLines={1}>
                  {safeWindow.destinationLocation?.address || 'Unknown Destination'}
                </Text>
              </View>
            </View>

            {/* Progress Bar */}
            {safeWindow.route_status === 'calculated' && (
              <View style={journeyStyles.progressContainer}>
                <View style={[journeyStyles.progressTrack, { backgroundColor: theme.surfaceVariant }]}>
                  <View style={[journeyStyles.progressFill, { width: `${progressPercent}%`, backgroundColor: theme.primary }]} />
                </View>
              </View>
            )}

            {/* Metrics Grid */}
            <View style={journeyStyles.metricsGrid}>
              <View style={[journeyStyles.metricBox, { backgroundColor: theme.surfaceVariant }]}>
                <Text style={[journeyStyles.metricLabel, { color: theme.onSurfaceVariant }]}>ETA</Text>
                <Text style={[journeyStyles.metricValue, { color: theme.onSurface }]}>{etaMinutes ? `${etaMinutes}m` : '--'}</Text>
              </View>
              <View style={[journeyStyles.metricBox, { backgroundColor: theme.surfaceVariant }]}>
                <Text style={[journeyStyles.metricLabel, { color: theme.onSurfaceVariant }]}>DIST</Text>
                <Text style={[journeyStyles.metricValue, { color: theme.onSurface }]}>{distKm ? `${distKm}km` : '--'}</Text>
              </View>
              <View style={[journeyStyles.metricBox, { backgroundColor: theme.surfaceVariant }]}>
                <Text style={[journeyStyles.metricLabel, { color: theme.onSurfaceVariant }]}>TIMER</Text>
                <Text style={[journeyStyles.metricValue, { color: theme.onSurface }]}>{formatTime(timeLeft)}</Text>
              </View>
            </View>
          </View>
          
          {safeWindow.routeDeviationDetected && (
            <View style={[journeyStyles.alertBanner, { backgroundColor: theme.errorContainer, borderColor: theme.error }]}>
              <Text style={[journeyStyles.alertBannerText, { color: theme.onErrorContainer }]}>
                ⚠️ Route Deviation Detected
              </Text>
            </View>
          )}
        </SafeAreaView>

        {/* Bottom Action Area */}
        <SafeAreaView style={journeyStyles.bottomContainer} pointerEvents="box-none">
          {showArrivalModal && (
            <View style={[journeyStyles.arrivalCard, { backgroundColor: theme.surface }]}>
              <Text style={[journeyStyles.arrivalTitle, { color: theme.onSurface }]}>You've Arrived! 🎉</Text>
              <Text style={[journeyStyles.arrivalDesc, { color: theme.onSurfaceVariant }]}>
                It looks like you've reached your destination. Please end your journey.
              </Text>
            </View>
          )}

          <View style={[journeyStyles.actionCard, { backgroundColor: theme.surface, shadowColor: isDark ? '#000' : '#CBD5E1' }]}>
            {/* Check-In Section */}
            <View style={journeyStyles.checkInContainer}>
              <View style={journeyStyles.checkInTextCol}>
                <Text style={[journeyStyles.checkInLabel, { color: isMissed ? theme.error : theme.onSurfaceVariant }]}>
                  CHECK-IN DUE IN
                </Text>
                <Text style={[journeyStyles.checkInTimer, { color: isMissed ? theme.error : theme.onSurface }]}>
                  {isMissed ? 'OVERDUE' : formatTime(checkInTimeLeft)}
                </Text>
              </View>
              <TouchableOpacity 
                style={[journeyStyles.largeCheckInBtn, { backgroundColor: theme.primary, opacity: isCheckingIn ? 0.7 : 1 }]}
                onPress={handleCheckIn}
                disabled={isCheckingIn}
                activeOpacity={0.8}
              >
                <Text style={journeyStyles.largeCheckInText}>
                  {isCheckingIn ? '...' : "I'm Safe"}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={[journeyStyles.divider, { backgroundColor: theme.border }]} />

            {/* Emergency & End Journey Actions */}
            <View style={journeyStyles.bottomActions}>
              <TouchableOpacity 
                style={[journeyStyles.emergencyBtn, { backgroundColor: theme.errorContainer }]}
                onPress={() => navigation.navigate('SOS')}
              >
                <Text style={[journeyStyles.emergencyBtnText, { color: theme.error }]}>🚨 SOS</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[journeyStyles.endJourneyBtn, { backgroundColor: theme.surfaceVariant }]}
                onPress={handleEnd}
                disabled={isCompleting}
              >
                <Text style={[journeyStyles.endJourneyBtnText, { color: theme.onSurface }]}>
                  {isCompleting ? 'Ending...' : 'End Journey'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // ── SETUP UI ──────────────────────────────────────────────────────────────
  if (showTrustedPlacesPicker) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: theme.border }}>
          <TouchableOpacity onPress={() => setShowTrustedPlacesPicker(false)} style={{ padding: 8 }}>
            <Text style={{ color: theme.primary, fontSize: 16, fontWeight: '600' }}>Cancel</Text>
          </TouchableOpacity>
        </View>
        <TrustedPlacesScreen 
          selectionMode={true}
          onSelectPlace={(tp) => {
            setSelectedTrustedPlace(tp);
            setDestPlace(null);
            setShowTrustedPlacesPicker(false);
          }} 
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[setupStyles.safeArea, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={setupStyles.container} showsVerticalScrollIndicator={false}>
          
          <View style={setupStyles.header}>
            <View style={[setupStyles.iconWrapper, { backgroundColor: theme.primaryContainer }]}>
              <Text style={{fontSize: 28}}>🛡️</Text>
            </View>
            <Text style={[setupStyles.title, { color: theme.onSurface }]}>Safe Window</Text>
            <Text style={[setupStyles.subtitle, { color: theme.onSurfaceVariant }]}>
              Protected routing. Your guardians are notified if you deviate or fail to check in.
            </Text>
          </View>

          {errorBanner && (
            <View style={[setupStyles.errorBanner, { backgroundColor: theme.errorContainer, borderColor: theme.error }]}>
              <Text style={{fontSize: 16, marginRight: 8}}>❌</Text>
              <Text style={[setupStyles.errorText, { color: theme.onErrorContainer }]}>{errorBanner}</Text>
            </View>
          )}
          
          {/* ── Route Setup Cards ────────────────────────────────────── */}
          <View style={setupStyles.section}>
            <Text style={[setupStyles.sectionTitle, { color: theme.onSurface }]}>Route Setup</Text>
            
            {/* Start Location Card */}
            <View style={[setupStyles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[setupStyles.cardLabel, { color: theme.onSurfaceVariant }]}>STARTING POINT</Text>
              
              <View style={setupStyles.toggleRow}>
                <TouchableOpacity 
                  onPress={() => setUseCurrentLocation(true)} 
                  style={[setupStyles.toggleBtn, useCurrentLocation ? { backgroundColor: theme.primaryContainer } : { backgroundColor: 'transparent' }]}
                >
                  <Text style={[setupStyles.toggleText, { color: useCurrentLocation ? theme.onPrimaryContainer : theme.onSurfaceVariant }]}>Current Location</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  onPress={() => setUseCurrentLocation(false)} 
                  style={[setupStyles.toggleBtn, !useCurrentLocation ? { backgroundColor: theme.primaryContainer } : { backgroundColor: 'transparent' }]}
                >
                  <Text style={[setupStyles.toggleText, { color: !useCurrentLocation ? theme.onPrimaryContainer : theme.onSurfaceVariant }]}>Select Map</Text>
                </TouchableOpacity>
              </View>

              {useCurrentLocation ? (
                <View style={[setupStyles.locationDisplay, { backgroundColor: theme.surfaceVariant }]}>
                  <Text style={{fontSize: 20, marginRight: 12}}>📍</Text>
                  <View style={{flex: 1}}>
                    <Text style={[setupStyles.locName, { color: theme.onSurface }]}>Current Location</Text>
                    <Text style={[setupStyles.locDesc, { color: theme.onSurfaceVariant }]}>Using GPS</Text>
                  </View>
                </View>
              ) : (
                !startPlace ? (
                  <TouchableOpacity 
                    style={[setupStyles.mapSelectBtn, { borderColor: theme.primary, borderStyle: 'dashed' }]} 
                    onPress={() => navigation.navigate('LocationPicker', { type: 'from' })}
                  >
                    <Text style={[setupStyles.mapSelectText, { color: theme.primary }]}>+ Choose on Map</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={[setupStyles.locationDisplay, { backgroundColor: theme.surfaceVariant }]}>
                    <View style={{flex: 1}}>
                      <Text style={[setupStyles.locName, { color: theme.onSurface }]} numberOfLines={1}>{startPlace.name}</Text>
                      <Text style={[setupStyles.locDesc, { color: theme.onSurfaceVariant }]} numberOfLines={1}>{startPlace.description}</Text>
                    </View>
                    <TouchableOpacity onPress={() => clearSelection('from')} style={setupStyles.clearBtn}>
                      <Text style={{ color: theme.error, fontWeight: '600' }}>✕</Text>
                    </TouchableOpacity>
                  </View>
                )
              )}
            </View>

            <View style={setupStyles.connectorLine} />

            {/* Destination Card */}
            <View style={[setupStyles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[setupStyles.cardLabel, { color: theme.onSurfaceVariant }]}>DESTINATION</Text>
              
              {isLoadingTp ? (
                <View style={{flexDirection: 'row', gap: 8, marginBottom: 16}}>
                   <SkeletonPulse style={{width: 80, height: 36, borderRadius: 18}} isDark={isDark} />
                   <SkeletonPulse style={{width: 100, height: 36, borderRadius: 18}} isDark={isDark} />
                </View>
              ) : (
                trustedPlaces.length > 0 && !selectedTrustedPlace && !destPlace && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16, marginHorizontal: -16, paddingHorizontal: 16 }}>
                    {trustedPlaces.slice(0, 5).map(tp => (
                      <TouchableOpacity
                        key={tp.id}
                        style={[setupStyles.tpChip, { backgroundColor: theme.surfaceVariant }]}
                        onPress={() => {
                          setSelectedTrustedPlace(tp);
                          setDestPlace(null);
                        }}
                      >
                        <Text style={setupStyles.tpChipIcon}>
                          {tp.label ? TRUSTED_PLACE_LABEL_ICONS[tp.label as TrustedPlaceLabel] : '📍'}
                        </Text>
                        <Text style={[setupStyles.tpChipName, { color: theme.onSurface }]} numberOfLines={1}>{tp.name}</Text>
                      </TouchableOpacity>
                    ))}
                    <TouchableOpacity
                      style={[setupStyles.tpChip, { backgroundColor: theme.background, borderWidth: 1, borderColor: theme.border }]}
                      onPress={() => setShowTrustedPlacesPicker(true)}
                    >
                      <Text style={[setupStyles.tpChipName, { color: theme.onSurface }]}>+ More</Text>
                    </TouchableOpacity>
                  </ScrollView>
                )
              )}

              {selectedTrustedPlace ? (
                <View style={[setupStyles.locationDisplay, { backgroundColor: theme.primaryContainer }]}>
                  <Text style={{fontSize: 20, marginRight: 12}}>
                    {selectedTrustedPlace.label ? TRUSTED_PLACE_LABEL_ICONS[selectedTrustedPlace.label as TrustedPlaceLabel] : '📍'}
                  </Text>
                  <View style={{flex: 1}}>
                    <Text style={[setupStyles.locName, { color: theme.onPrimaryContainer }]} numberOfLines={1}>{selectedTrustedPlace.name}</Text>
                    <Text style={[setupStyles.locDesc, { color: theme.onPrimaryContainer, opacity: 0.8 }]} numberOfLines={1}>{selectedTrustedPlace.address}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setSelectedTrustedPlace(null)} style={setupStyles.clearBtn}>
                    <Text style={{ color: theme.onPrimaryContainer, fontWeight: '700' }}>✕</Text>
                  </TouchableOpacity>
                </View>
              ) : destPlace ? (
                <View style={[setupStyles.locationDisplay, { backgroundColor: theme.surfaceVariant }]}>
                  <View style={{flex: 1}}>
                    <Text style={[setupStyles.locName, { color: theme.onSurface }]} numberOfLines={1}>{destPlace.name}</Text>
                    <Text style={[setupStyles.locDesc, { color: theme.onSurfaceVariant }]} numberOfLines={1}>{destPlace.description}</Text>
                  </View>
                  <TouchableOpacity onPress={() => clearSelection('to')} style={setupStyles.clearBtn}>
                    <Text style={{ color: theme.error, fontWeight: '600' }}>✕</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity 
                  style={[setupStyles.mapSelectBtn, { borderColor: theme.primary, borderStyle: 'dashed' }]} 
                  onPress={() => navigation.navigate('LocationPicker', { type: 'to' })}
                >
                  <Text style={[setupStyles.mapSelectText, { color: theme.primary }]}>+ Choose Destination on Map</Text>
                </TouchableOpacity>
              )}

              {destPlace && !selectedTrustedPlace && (
                <TouchableOpacity 
                  style={{marginTop: 12, alignSelf: 'flex-start'}}
                  onPress={handleQuickSaveTp}
                  disabled={isSavingTp}
                >
                  <Text style={{ color: theme.primary, fontWeight: '600', fontSize: 13 }}>
                    {isSavingTp ? 'Saving...' : '+ Save as Trusted Place'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* ── Settings ────────────────────────────────────── */}
          <View style={setupStyles.section}>
            <Text style={[setupStyles.sectionTitle, { color: theme.onSurface }]}>Safety Settings</Text>
            
            <View style={[setupStyles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[setupStyles.cardLabel, { color: theme.onSurfaceVariant }]}>DEAD-MAN CHECK-IN TIMER</Text>
              <Text style={[setupStyles.cardDesc, { color: theme.onSurfaceVariant }]}>Require me to tap "I'm Safe" every:</Text>
              
              <View style={setupStyles.timerOptions}>
                {CHECKIN_OPTIONS.map(min => (
                  <TouchableOpacity
                    key={min}
                    style={[
                      setupStyles.timerBtn,
                      { borderColor: theme.border },
                      checkInMinutes === min && { backgroundColor: theme.primaryContainer, borderColor: theme.primary }
                    ]}
                    onPress={() => setCheckInMinutes(min)}
                  >
                    <Text style={[
                      setupStyles.timerBtnText,
                      { color: theme.onSurface },
                      checkInMinutes === min && { color: theme.onPrimaryContainer, fontWeight: '700' }
                    ]}>{min} min</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
          
          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
      
      {/* ── Setup Footer Action ─────────────────────────────────────────── */}
      <View style={[setupStyles.footer, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
        <TouchableOpacity 
          style={[setupStyles.startBtn, { backgroundColor: theme.primary, opacity: isStarting ? 0.7 : 1 }]}
          onPress={() => handleStart(60)}
          disabled={isStarting}
          activeOpacity={0.8}
        >
          <Text style={setupStyles.startBtnText}>
            {isStarting ? 'Starting...' : 'Start Safe Window'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

// ── Styles: Active Journey ───────────────────────────────────────────────────
const journeyStyles = StyleSheet.create({
  topContainer: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 10 : 40 },
  statusCard: { borderRadius: 20, padding: 16, elevation: 6, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12 },
  statusHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  pulseDot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  statusTitle: { fontSize: 14, fontWeight: '800', letterSpacing: 1 },
  destRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  destLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', marginBottom: 2 },
  destName: { fontSize: 16, fontWeight: '600' },
  progressContainer: { height: 6, borderRadius: 3, overflow: 'hidden', marginBottom: 16 },
  progressTrack: { flex: 1 },
  progressFill: { height: '100%', borderRadius: 3 },
  metricsGrid: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  metricBox: { flex: 1, minWidth: '22%', borderRadius: 12, padding: 10, alignItems: 'center', justifyContent: 'center' },
  metricLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', marginBottom: 4 },
  metricValue: { fontSize: 16, fontWeight: '700' },
  alertBanner: { marginTop: 12, padding: 12, borderRadius: 12, borderWidth: 1, alignItems: 'center' },
  alertBannerText: { fontWeight: '700', fontSize: 14 },
  
  bottomContainer: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 16, paddingBottom: Platform.OS === 'ios' ? 34 : 24 },
  arrivalCard: { padding: 16, borderRadius: 16, marginBottom: 12, alignItems: 'center', elevation: 4 },
  arrivalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  arrivalDesc: { fontSize: 13, textAlign: 'center' },
  actionCard: { borderRadius: 24, padding: 20, elevation: 8, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.2, shadowRadius: 16 },
  checkInContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  checkInTextCol: { flex: 1 },
  checkInLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 4 },
  checkInTimer: { fontSize: 24, fontWeight: '800', fontVariant: ['tabular-nums'] },
  largeCheckInBtn: { paddingVertical: 16, paddingHorizontal: 28, borderRadius: 100, elevation: 2 },
  largeCheckInText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  divider: { height: 1, marginVertical: 20, opacity: 0.5 },
  bottomActions: { flexDirection: 'row', gap: 12 },
  emergencyBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  emergencyBtnText: { fontSize: 15, fontWeight: '700' },
  endJourneyBtn: { flex: 2, paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  endJourneyBtnText: { fontSize: 15, fontWeight: '600' }
});

// ── Styles: Setup Flow ───────────────────────────────────────────────────────
const setupStyles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { padding: 20 },
  header: { alignItems: 'center', marginVertical: 24 },
  iconWrapper: { width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 28, fontWeight: '800', marginBottom: 8 },
  subtitle: { fontSize: 14, textAlign: 'center', lineHeight: 22, paddingHorizontal: 20 },
  errorBanner: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 20 },
  errorText: { flex: 1, fontSize: 14, fontWeight: '500' },
  section: { marginBottom: 28 },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: 16, marginLeft: 4 },
  card: { padding: 16, borderRadius: 20, borderWidth: 1 },
  cardLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 16 },
  cardDesc: { fontSize: 13, marginBottom: 12 },
  connectorLine: { width: 2, height: 24, backgroundColor: '#CBD5E1', marginLeft: 36, marginVertical: 4 },
  toggleRow: { flexDirection: 'row', backgroundColor: 'transparent', borderRadius: 12, padding: 4, marginBottom: 16, borderWidth: 1, borderColor: '#E2E8F0' },
  toggleBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  toggleText: { fontSize: 14, fontWeight: '600' },
  locationDisplay: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 16 },
  locName: { fontSize: 15, fontWeight: '700', marginBottom: 4 },
  locDesc: { fontSize: 13 },
  clearBtn: { padding: 8, marginLeft: 8 },
  mapSelectBtn: { paddingVertical: 16, borderRadius: 16, borderWidth: 2, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' },
  mapSelectText: { fontSize: 15, fontWeight: '600' },
  tpChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 100, marginRight: 8 },
  tpChipIcon: { fontSize: 16, marginRight: 6 },
  tpChipName: { fontSize: 14, fontWeight: '600' },
  timerOptions: { flexDirection: 'row', gap: 12 },
  timerBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, alignItems: 'center' },
  timerBtnText: { fontSize: 15, fontWeight: '600' },
  footer: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: Platform.OS === 'ios' ? 34 : 20, borderTopWidth: 1 },
  startBtn: { paddingVertical: 18, borderRadius: 16, alignItems: 'center', elevation: 2 },
  startBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' }
});
