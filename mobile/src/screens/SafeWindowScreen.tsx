import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Platform, TouchableOpacity, KeyboardAvoidingView, Alert, Modal } from 'react-native';
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

export const SafeWindowScreen: React.FC = () => {
  const { safeWindow, startSafeWindow, endSafeWindow, getRemainingSeconds, getCheckInRemainingSeconds, markCheckInSafe, resumeRoute, cancelDeviationWarning, batteryOptimizationDenied, openBatterySettings, isStartingJourney, showArrivalModal, closeArrivalModal, currentLocation, distanceToDestination } = useSafeWindow();
  
  const route = useRoute<RouteProp<RootStackParamList, 'SafeWindow'>>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

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

  const loadTrustedPlaces = () => {
    trustedPlacesApi.list()
      .then(data => setTrustedPlaces(data))
      .catch((err) => console.error('[TrustedPlaces] load failed:', err));
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
      // Clear params to avoid loop
      navigation.setParams({ pickedLocation: undefined });
    }
  }, [route.params?.pickedLocation]);

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
  }, [safeWindow.status, safeWindow.endsAt, safeWindow.checkInDueAt, getRemainingSeconds, getCheckInRemainingSeconds]);

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

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleStart = async (minutes: 15|30|60|0.5, forceStart: boolean = false) => {
    setIsStarting(true);
    setErrorBanner(null);
    let startLoc, destLoc;
    
    if (useCurrentLocation) {
      const locData = await getCurrentLocationForAlert(true);
      if (locData && !locData.permissionDenied) {
        reverseGeocode(locData.latitude, locData.longitude).catch(() => {});
        startLoc = { latitude: locData.latitude, longitude: locData.longitude, address: "Current Location" };
        if (!isWithinTamilNadu(locData.latitude, locData.longitude)) {
          Alert.alert('Location Warning', 'Your current GPS location appears to be outside Tamil Nadu.');
        }
      } else {
        Alert.alert('Location Warning', 'Location permission denied. Journey can start but exact start location is unavailable.');
      }
    } else if (startPlace) {
      startLoc = { latitude: startPlace.latitude!, longitude: startPlace.longitude!, address: startPlace.name, placeId: startPlace.id, provider: startPlace.provider };
    } else {
      Alert.alert('Missing Location', 'Please select a starting location.');
      setIsStarting(false);
      return;
    }
    
    if (destPlace) {
      destLoc = { latitude: destPlace.latitude!, longitude: destPlace.longitude!, address: destPlace.name, placeId: destPlace.id, provider: destPlace.provider };
    } else if (selectedTrustedPlace) {
      destLoc = { 
        latitude: selectedTrustedPlace.latitude, 
        longitude: selectedTrustedPlace.longitude, 
        address: selectedTrustedPlace.address || selectedTrustedPlace.name 
      };
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
    
    try {
      await startSafeWindow(minutes, checkInMinutes, startLoc, destLoc, selectedTrustedPlace);
    } catch (e: any) {
      setErrorBanner(e.message || 'Could not start journey. Please try again.');
    } finally {
      setIsStarting(false);
    }
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

  if (safeWindow.status === 'ACTIVE' || safeWindow.status === 'MISSED_CHECKIN') {
    return (
      <View style={{ flex: 1 }}>
        <MapRouteLayer
          routePoints={safeWindow.routePoints}
          currentLocation={currentLocation || (safeWindow.startLocation ? { lat: safeWindow.startLocation.latitude, lon: safeWindow.startLocation.longitude } : null)}
          startLocation={safeWindow.startLocation ? { lat: safeWindow.startLocation.latitude, lon: safeWindow.startLocation.longitude } : null}
          destinationLocation={safeWindow.destinationLocation ? { lat: safeWindow.destinationLocation.latitude, lon: safeWindow.destinationLocation.longitude } : null}
        />
        
        {/* Floating Overlay for Status */}
        <SafeAreaView style={styles.floatingOverlay} pointerEvents="box-none">
          <View style={styles.topPanel}>
            <View style={styles.statusRow}>
              <Text style={styles.label}>Journey Active</Text>
              <View style={[styles.statusBadge, safeWindow.status === 'MISSED_CHECKIN' ? styles.badgeError : styles.badgeActive]}>
                <Text style={[styles.statusText, safeWindow.status === 'MISSED_CHECKIN' ? styles.textError : styles.textActive]}>
                  {safeWindow.status === 'MISSED_CHECKIN' ? 'Missed Check-in' : 'Tracking'}
                </Text>
              </View>
            </View>
            
            {safeWindow.route_status === 'calculated' && (safeWindow.distance_km != null || distanceToDestination != null) && (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 }}>
                <View>
                  <Text style={{ fontSize: 12, color: '#64748B', fontWeight: 'bold' }}>ETA</Text>
                  <Text style={{ fontSize: 24, fontWeight: '800', color: '#1E293B' }}>
                    {distanceToDestination != null 
                      ? `${Math.max(1, Math.round(distanceToDestination / 1000 / 0.5))}m` // 30km/h avg speed
                      : `${safeWindow.estimated_duration_minutes || '--'}m`}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 12, color: '#64748B', fontWeight: 'bold' }}>DISTANCE</Text>
                  <Text style={{ fontSize: 24, fontWeight: '800', color: '#1E293B' }}>
                    {distanceToDestination != null 
                      ? `${(distanceToDestination / 1000).toFixed(1)} km` 
                      : `${safeWindow.distance_km || '--'} km`}
                  </Text>
                </View>
              </View>
            )}
          </View>

          <View style={{ flex: 1 }} pointerEvents="none" />

          <View style={styles.bottomPanel}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
              <View style={[styles.timerCircleSmall, { backgroundColor: '#EEF2FF', borderColor: '#C7D2FE' }]}>
                <Text style={styles.countdownTitleSmall}>Time Left</Text>
                <Text style={styles.countdownSmall}>{formatTime(timeLeft)}</Text>
              </View>
              <View style={[styles.timerCircleSmall, { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' }]}>
                <Text style={styles.countdownTitleSmall}>Check-in In</Text>
                <Text style={[styles.countdownSmall, { color: '#D97706' }]}>{formatTime(checkInTimeLeft)}</Text>
              </View>
            </View>
            
            <PrimaryButton title={isCheckingIn ? "Checking in..." : "I'm Safe (Check-in)"} variant="primary" onPress={handleCheckIn} disabled={isCheckingIn} style={{width: '100%', marginBottom: 12}} />
            <PrimaryButton title={isCompleting ? "Ending..." : "End Journey"} variant="outline" onPress={handleEnd} disabled={isCompleting} style={{width: '100%'}} />
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Text style={styles.title}>Journey Mode</Text>
            <Text style={styles.subtitle}>Protected routing. Your guardians are notified if you deviate or fail to check in.</Text>
          </View>

          <View style={styles.optionsSection}>
            {errorBanner && (
              <View style={styles.errorBannerCard}>
                <Text style={styles.errorBannerIcon}>❌</Text>
                <Text style={styles.errorBannerText}>{errorBanner}</Text>
              </View>
            )}
            
            <View style={styles.card}>
              <SectionHeader title="Route Setup" subtitle="Let SafeHer monitor your journey." />
              <View style={styles.routeForm}>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>From</Text>
                  <View style={{flexDirection: 'row', marginBottom: 8}}>
                      <TouchableOpacity onPress={() => setUseCurrentLocation(true)} style={[styles.chip, useCurrentLocation && styles.chipSelected, {flex: 1, marginRight: 4}]}>
                        <Text style={useCurrentLocation ? styles.chipTextSelected : styles.chipText}>Current Location</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => setUseCurrentLocation(false)} style={[styles.chip, !useCurrentLocation && styles.chipSelected, {flex: 1, marginLeft: 4}]}>
                        <Text style={!useCurrentLocation ? styles.chipTextSelected : styles.chipText}>Select on Map</Text>
                      </TouchableOpacity>
                  </View>
                  
                  {useCurrentLocation ? (
                    <View style={styles.selectedPlaceCard}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.selectedPlaceName}>📍 Current Location</Text>
                        <Text style={styles.selectedPlaceDesc}>Using GPS</Text>
                      </View>
                    </View>
                  ) : (
                    !startPlace ? (
                      <TouchableOpacity style={styles.mapSelectBtn} onPress={() => navigation.navigate('LocationPicker', { type: 'from' })}>
                        <Text style={styles.mapSelectBtnText}>+ Choose Starting Location on Map</Text>
                      </TouchableOpacity>
                    ) : (
                      <View style={styles.selectedPlaceCard}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.selectedPlaceName}>{startPlace.name}</Text>
                          <Text style={styles.selectedPlaceDesc}>{startPlace.description}</Text>
                        </View>
                        <TouchableOpacity onPress={() => clearSelection('from')} style={styles.clearBtn}>
                          <Text style={styles.clearText}>Clear</Text>
                        </TouchableOpacity>
                      </View>
                    )
                  )}
                </View>
                
                <View style={styles.inputGroup}>
                  {trustedPlaces.length > 0 && !selectedTrustedPlace && (
                    <View style={{ marginBottom: 12 }}>
                      <Text style={styles.inputLabel}>Trusted Places</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
                        {trustedPlaces.slice(0, 5).map(tp => (
                          <TouchableOpacity
                            key={tp.id}
                            style={tpStyles.chip}
                            onPress={() => {
                              setSelectedTrustedPlace(tp);
                              setDestPlace(null);
                            }}
                          >
                            <Text style={tpStyles.chipIcon}>
                              {tp.label ? TRUSTED_PLACE_LABEL_ICONS[tp.label as TrustedPlaceLabel] : '📍'}
                            </Text>
                            <Text style={tpStyles.chipName} numberOfLines={1}>{tp.name}</Text>
                          </TouchableOpacity>
                        ))}
                        <TouchableOpacity
                          style={[tpStyles.chip, { backgroundColor: '#F1F5F9' }]}
                          onPress={() => setShowTrustedPlacesPicker(true)}
                        >
                          <Text style={tpStyles.chipName}>+ More</Text>
                        </TouchableOpacity>
                      </ScrollView>
                    </View>
                  )}

                  {selectedTrustedPlace && (
                    <View style={{ marginBottom: 12 }}>
                      <Text style={styles.inputLabel}>Destination (Trusted Place)</Text>
                      <View style={tpStyles.selectedCard}>
                        <Text style={tpStyles.selectedIcon}>
                          {selectedTrustedPlace.label
                            ? TRUSTED_PLACE_LABEL_ICONS[selectedTrustedPlace.label as TrustedPlaceLabel]
                            : '📍'}
                        </Text>
                        <View style={{ flex: 1 }}>
                          <Text style={tpStyles.selectedName}>{selectedTrustedPlace.name}</Text>
                          <Text style={tpStyles.selectedRadius}>Arrival radius: {selectedTrustedPlace.radius_meters}m</Text>
                        </View>
                        <TouchableOpacity
                          onPress={() => setSelectedTrustedPlace(null)}
                          style={tpStyles.clearTp}
                        >
                          <Text style={{ color: '#4F46E5', fontWeight: '700', fontSize: 12 }}>Clear</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}

                  {!selectedTrustedPlace && (
                    <>
                      <Text style={styles.inputLabel}>To (Optional)</Text>
                      {!destPlace ? (
                        <TouchableOpacity style={styles.mapSelectBtn} onPress={() => navigation.navigate('LocationPicker', { type: 'to' })}>
                          <Text style={styles.mapSelectBtnText}>+ Choose Destination on Map</Text>
                        </TouchableOpacity>
                      ) : (
                        <View>
                          <View style={styles.selectedPlaceCard}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.selectedPlaceName}>{destPlace.name}</Text>
                              <Text style={styles.selectedPlaceDesc}>{destPlace.description}</Text>
                            </View>
                            <TouchableOpacity onPress={() => clearSelection('to')} style={styles.clearBtn}>
                              <Text style={styles.clearText}>Clear</Text>
                            </TouchableOpacity>
                          </View>
                          <TouchableOpacity onPress={handleQuickSaveTp} style={{ marginTop: 12, paddingVertical: 8, alignSelf: 'flex-start' }} disabled={isSavingTp}>
                            <Text style={{ color: '#4F46E5', fontSize: 14, fontWeight: '700' }}>
                              {isSavingTp ? 'Saving...' : '+ Save this destination as trusted place'}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </>
                  )}
                </View>
              </View>
            </View>

            <View style={styles.card}>
              <SectionHeader title="Start Journey" subtitle="Select expected travel time" />
              
              <View style={styles.checkInSection}>
                <Text style={styles.sectionLabel}>Check-in every</Text>
                <View style={styles.chipRow}>
                  {CHECKIN_OPTIONS.map((min) => (
                    <TouchableOpacity
                      key={min}
                      onPress={() => setCheckInMinutes(min)}
                      style={[styles.chip, checkInMinutes === min && styles.chipSelected]}
                    >
                      <Text style={checkInMinutes === min ? styles.chipTextSelected : styles.chipText}>
                        {min} min
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.buttonGrid}>
                <PrimaryButton style={styles.gridButton} title={isStartingJourney || (isStarting && !isStartingJourney) ? "Starting..." : "15 min"} disabled={isStarting || isStartingJourney} onPress={() => handleStart(15)} variant="dark" />
                <PrimaryButton style={styles.gridButton} title={isStartingJourney || (isStarting && !isStartingJourney) ? "Starting..." : "30 min"} disabled={isStarting || isStartingJourney} onPress={() => handleStart(30)} variant="dark" />
                <PrimaryButton style={styles.gridButton} title={isStartingJourney || (isStarting && !isStartingJourney) ? "Starting..." : "60 min"} disabled={isStarting || isStartingJourney} onPress={() => handleStart(60)} variant="dark" />
                <PrimaryButton style={styles.gridButton} title={isStartingJourney || (isStarting && !isStartingJourney) ? "Starting..." : "Test (30s)"} disabled={isStarting || isStartingJourney} onPress={() => handleStart(0.5)} variant="outline" />
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={showTrustedPlacesPicker}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowTrustedPlacesPicker(false)}
      >
        <SafeAreaView style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }}>
            <TouchableOpacity onPress={() => setShowTrustedPlacesPicker(false)} style={{ marginRight: 16 }}>
              <Text style={{ fontSize: 16, color: '#64748B' }}>✕ Cancel</Text>
            </TouchableOpacity>
          </View>
          <TrustedPlacesScreen
            selectionMode
            onSelectPlace={(place) => {
              setSelectedTrustedPlace(place);
              setDestPlace(null);
              setShowTrustedPlacesPicker(false);
            }}
          />
        </SafeAreaView>
      </Modal>

      <Modal
        visible={showArrivalModal}
        animationType="fade"
        presentationStyle="overFullScreen"
        transparent
        onRequestClose={() => {}}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ backgroundColor: 'white', borderRadius: 20, padding: 32, margin: 24, maxWidth: 400, width: '100%' }}>
            <Text style={{ fontSize: 24, fontWeight: '900', color: '#1E293B', marginBottom: 12, textAlign: 'center' }}>
              You've reached your safe place
            </Text>
            <Text style={{ fontSize: 16, color: '#64748B', textAlign: 'center', marginBottom: 24, lineHeight: 22 }}>
              Your Safe Window destination was reached successfully.
            </Text>
            <PrimaryButton
              title="Close Safe Window"
              onPress={closeArrivalModal}
              style={{ marginBottom: 0 }}
            />
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FAFAF9' },
  container: { flexGrow: 1, padding: 24, paddingTop: Platform.OS === 'ios' ? 20 : 60 },
  header: { marginBottom: 24 },
  title: { fontSize: 32, fontWeight: '900', color: '#1E293B', marginBottom: 8, letterSpacing: -0.5 },
  subtitle: { fontSize: 16, color: '#64748B', fontWeight: '500', lineHeight: 22 },
  card: { backgroundColor: '#FFFFFF', padding: 24, borderRadius: 20, marginBottom: 16, shadowColor: '#1E293B', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2, borderWidth: 1, borderColor: '#F1F5F9' },
  optionsSection: { marginTop: 8 },
  buttonGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  gridButton: { width: '48%', marginBottom: 12 },
  routeForm: { marginTop: 8 },
  inputGroup: { marginBottom: 16 },
  inputLabel: { fontSize: 13, fontWeight: '700', color: '#64748B', marginBottom: 8, textTransform: 'uppercase' },
  chipRow: { flexDirection: 'row', gap: 8 },
  chip: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0' },
  chipSelected: { backgroundColor: '#4F46E5', borderColor: '#4F46E5' },
  chipText: { fontSize: 14, fontWeight: '600', color: '#475569', textAlign: 'center' },
  chipTextSelected: { fontSize: 14, fontWeight: '600', color: '#FFFFFF', textAlign: 'center' },
  mapSelectBtn: { backgroundColor: '#EEF2FF', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#C7D2FE', alignItems: 'center', borderStyle: 'dashed' },
  mapSelectBtnText: { color: '#4F46E5', fontWeight: '700', fontSize: 14 },
  selectedPlaceCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#EEF2FF', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#C7D2FE' },
  selectedPlaceName: { fontSize: 16, fontWeight: '800', color: '#3730A3' },
  selectedPlaceDesc: { fontSize: 14, color: '#4F46E5', marginTop: 4 },
  clearBtn: { backgroundColor: '#FFFFFF', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#C7D2FE' },
  clearText: { color: '#4F46E5', fontWeight: '800', fontSize: 12, textTransform: 'uppercase' },
  errorBannerCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEF2F2', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#FECACA', marginBottom: 16 },
  errorBannerIcon: { fontSize: 20, marginRight: 12 },
  errorBannerText: { fontSize: 14, color: '#991B1B', flex: 1, fontWeight: '600' },
  checkInSection: { marginBottom: 20 },
  sectionLabel: { fontSize: 14, fontWeight: '700', color: '#64748B', marginBottom: 8 },
  floatingOverlay: { flex: 1, padding: 16, justifyContent: 'space-between' },
  topPanel: { backgroundColor: 'white', padding: 16, borderRadius: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 5 },
  bottomPanel: { backgroundColor: 'white', padding: 16, borderRadius: 16, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 5 },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontSize: 16, fontWeight: '800', color: '#1E293B' },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  badgeActive: { backgroundColor: '#EEF2FF' },
  badgeError: { backgroundColor: '#FEE2E2' },
  statusText: { fontSize: 13, fontWeight: '800', textTransform: 'uppercase' },
  textActive: { color: '#4F46E5' },
  textError: { color: '#DC2626' },
  timerCircleSmall: { flex: 1, borderRadius: 12, padding: 16, alignItems: 'center', borderWidth: 1, marginHorizontal: 4 },
  countdownTitleSmall: { fontSize: 12, color: '#64748B', fontWeight: '700', textTransform: 'uppercase', marginBottom: 4 },
  countdownSmall: { fontSize: 28, fontWeight: '800', color: '#4F46E5' }
});

const tpStyles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: '#EEF2FF', borderWidth: 1, borderColor: '#C7D2FE', marginRight: 8 },
  chipIcon: { fontSize: 16, marginRight: 4 },
  chipName: { fontSize: 13, fontWeight: '600', color: '#3730A3', maxWidth: 90 },
  selectedCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EEF2FF', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#C7D2FE' },
  selectedIcon: { fontSize: 24, marginRight: 10 },
  selectedName: { fontSize: 15, fontWeight: '700', color: '#3730A3' },
  selectedRadius: { fontSize: 12, color: '#6366F1', marginTop: 2 },
  clearTp: { backgroundColor: '#FFFFFF', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#C7D2FE', marginLeft: 8 }
});
