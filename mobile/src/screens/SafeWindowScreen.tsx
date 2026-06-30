import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Platform, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Alert } from 'react-native';
import { useSafeWindow } from '../context/SafeWindowContext';
import { PrimaryButton } from '../components/PrimaryButton';
import { SectionHeader } from '../components/SectionHeader';
import { getCurrentLocationForAlert } from '../utils/location';
import { searchPlaces, geocodePlace, reverseGeocode, PlaceResult, isUsingNominatim } from '../services/geocodingService';
import { formatDistance, distanceBetweenPointsMeters } from '../utils/geoUtils';

export const SafeWindowScreen: React.FC = () => {
  const { safeWindow, startSafeWindow, endSafeWindow, getRemainingSeconds, getCheckInRemainingSeconds, markCheckInSafe, distanceToDestination, resumeRoute, cancelDeviationWarning, batteryOptimizationDenied, openBatterySettings, isStartingJourney } = useSafeWindow();
  
  const [timeLeft, setTimeLeft] = useState(getRemainingSeconds());
  const [checkInTimeLeft, setCheckInTimeLeft] = useState(getCheckInRemainingSeconds());
  const [warningTimeLeft, setWarningTimeLeft] = useState(0);
  
  const CHECKIN_OPTIONS = [3, 5, 10] as const;
  const [checkInMinutes, setCheckInMinutes] = useState<3 | 5 | 10>(5);
  
  const [useCurrentLocation, setUseCurrentLocation] = useState(true);
  const [fromQuery, setFromQuery] = useState('');
  const [startPlace, setStartPlace] = useState<PlaceResult | null>(null);
  const [toQuery, setToQuery] = useState('');
  
  const [searchResults, setSearchResults] = useState<PlaceResult[]>([]);
  const [searchTarget, setSearchTarget] = useState<'from' | 'to' | null>(null);
  
  const [destPlace, setDestPlace] = useState<PlaceResult | null>(null);
  
  const [isStarting, setIsStarting] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const searchTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

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

  const handleSearch = async (text: string, type: 'from' | 'to') => {
    if (type === 'to') setToQuery(text);
    else setFromQuery(text);
    setSearchTarget(type);
    
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    if (text.length > 2) {
      setIsSearching(true);
      setErrorBanner(null);
      searchTimeoutRef.current = setTimeout(async () => {
        try {
          let currentLoc;
          try {
            const locData = await getCurrentLocationForAlert();
            if (locData && !locData.permissionDenied) {
              currentLoc = { latitude: locData.latitude, longitude: locData.longitude };
            }
          } catch (e) {}
          
          const results = await searchPlaces(text, currentLoc);
          if (results.length === 0) {
            setErrorBanner("No locations found.");
          }
          setSearchResults(results);
        } catch (e: any) {
          if (e.message === "Google Maps API key not configured") {
             if (!isUsingNominatim) {
                 setErrorBanner("Google Maps API key not configured.");
             }
          } else {
             setErrorBanner("Location search unavailable.");
          }
        } finally {
          setIsSearching(false);
        }
      }, 1000); // 1-second debounce
    } else {
      setSearchResults([]);
      setIsSearching(false);
    }
  };

  const isWithinTamilNadu = (lat: number, lon: number): boolean => {
    return lat >= 8.0 && lat <= 13.7 && lon >= 76.0 && lon <= 80.5;
  };

  const handleSelectPlace = (place: PlaceResult) => {
    if (place.latitude && place.longitude && !isWithinTamilNadu(place.latitude, place.longitude)) {
      Alert.alert('Outside Service Area', 'For this demo, please select a location inside Tamil Nadu.');
      return;
    }
    
    if (searchTarget === 'to') {
      setDestPlace(place);
      setToQuery(place.name);
    } else {
      setStartPlace(place);
      setFromQuery(place.name);
    }
    setSearchResults([]);
    setSearchTarget(null);
  };

  const clearSelection = (type: 'from' | 'to') => {
    if (type === 'to') {
      setDestPlace(null);
      setToQuery('');
    } else {
      setStartPlace(null);
      setFromQuery('');
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
    
    // Start Location Resolution
    if (useCurrentLocation) {
      const locData = await getCurrentLocationForAlert(true); // fast mode
      if (locData && !locData.permissionDenied) {
        reverseGeocode(locData.latitude, locData.longitude).catch(() => {});
        startLoc = { latitude: locData.latitude, longitude: locData.longitude, address: "Current Location" };
        if (!isWithinTamilNadu(locData.latitude, locData.longitude)) {
          Alert.alert('Location Warning', 'Your current GPS location appears to be outside Tamil Nadu. SafeHer demo requires Tamil Nadu locations.');
        } else if ((locData as any).accuracy && (locData as any).accuracy > 100) {
          Alert.alert('Location Warning', 'GPS accuracy is currently low. Your journey will start, but the exact start location may be inaccurate.');
        }
      } else {
        Alert.alert('Location Warning', 'Location permission denied. Journey can start but exact start location is unavailable.');
      }
    } else if (startPlace) {
      const coords = await geocodePlace(startPlace.id);
      if (coords) {
         startLoc = { ...coords, address: startPlace.name, placeId: startPlace.id, provider: startPlace.provider };
      } else {
         startLoc = { latitude: startPlace.latitude!, longitude: startPlace.longitude!, address: startPlace.name, placeId: startPlace.id, provider: startPlace.provider };
      }
    } else {
      Alert.alert('Missing Location', 'Please select a starting location.');
      setIsStarting(false);
      return;
    }
    
    if (destPlace) {
      const coords = await geocodePlace(destPlace.id);
      if (coords) {
         destLoc = { ...coords, address: destPlace.name, placeId: destPlace.id, provider: destPlace.provider };
      } else {
         destLoc = { latitude: destPlace.latitude!, longitude: destPlace.longitude!, address: destPlace.name, placeId: destPlace.id, provider: destPlace.provider };
      }
      
      // Far-destination guard (100km)
      if (!forceStart && startLoc && startLoc.latitude && startLoc.longitude && destLoc.latitude && destLoc.longitude) {
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
    }
    
    try {
      await startSafeWindow(minutes, checkInMinutes, startLoc, destLoc);
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

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Text style={styles.title}>Journey Mode</Text>
            <Text style={styles.subtitle}>Protected routing. Your guardians are notified if you deviate or fail to check in.</Text>
          </View>

          {safeWindow.status === 'ACTIVE' || safeWindow.status === 'MISSED_CHECKIN' ? (
            <>
              <View style={[styles.statusCard, safeWindow.status === 'MISSED_CHECKIN' && styles.statusCardError]}>
                <View style={styles.statusRow}>
                  <Text style={styles.label}>Journey Status</Text>
                  <View style={[styles.statusBadge, 
                      safeWindow.status === 'ACTIVE' ? styles.badgeActive : 
                      styles.badgeError]}>
                    <Text style={[styles.statusText, 
                        safeWindow.status === 'ACTIVE' ? (safeWindow.missedCheckInAt ? styles.textError : styles.textActive) : 
                        styles.textError]}>
                      {safeWindow.status === 'ACTIVE' ? (safeWindow.missedCheckInAt ? 'Active (Missed Check-in)' : 'Active Tracking') : 'Ended'}
                    </Text>
                  </View>
                </View>
              </View>

              {safeWindow.status === 'ACTIVE' ? (
                <View style={styles.activeSection}>
                  
                  {safeWindow.missedCheckInAt && (
                    <View style={[styles.warningBox, {borderColor: '#DC2626', backgroundColor: '#FEF2F2'}]}>
                      <Text style={[styles.warningTitle, {color: '#DC2626'}]}>⚠️ Check-in missed</Text>
                      <Text style={styles.warningText}>Guardians have been notified. Journey is still active. Please check in below.</Text>
                    </View>
                  )}

                  <View style={styles.timerCircle}>
                    <Text style={styles.countdownTitle}>Window Time</Text>
                    <Text style={styles.countdown}>{formatTime(timeLeft)}</Text>
                  </View>
                  
                  <View style={[styles.nextCheckInBox, safeWindow.routeDeviationDetected && styles.deviationAlertBox]}>
                    <Text style={styles.checkInLabel}>Check-in Required In</Text>
                    <Text style={styles.checkInCountdown}>{formatTime(checkInTimeLeft)}</Text>
                  </View>
                  
                  <PrimaryButton title={isCheckingIn ? "Checking in..." : "I'm Safe (Check-in)"} variant="primary" onPress={handleCheckIn} disabled={isCheckingIn} style={{width: '100%', marginBottom: 16}} />

                  <View style={styles.riskCard}>
                     <View style={styles.riskHeader}>
                       <Text style={styles.riskTitle}>Status / Risk</Text>
                       <View style={[styles.riskBadge, riskScore === 'LOW' ? styles.riskBadgeLow : styles.riskBadgeHigh]}>
                         <Text style={[styles.riskValue, riskScore === 'LOW' ? styles.riskLow : styles.riskHigh]}>
                           {riskScore === 'LOW' ? 'Low Risk' : 'High Risk'}
                         </Text>
                       </View>
                     </View>
                  </View>

                  <View style={styles.routeCard}>
                     <View style={styles.routeHeader}>
                        <Text style={styles.routeIcon}>📍</Text>
                        <Text style={styles.routeTitle}>Route Tracking</Text>
                     </View>
                     
                     {!safeWindow.destinationLocation ? (
                        <Text style={styles.routeText}>Destination not selected.</Text>
                     ) : (
                       <View>

                       
                       {safeWindow.route_status === 'calculated' || safeWindow.route_status === 'ok' ? (
                         safeWindow.distance_km != null && safeWindow.estimated_duration_minutes != null ? (
                           <View>
                             <Text style={styles.routeText}>Distance: <Text style={{fontWeight: 'bold'}}>{safeWindow.distance_km} km</Text></Text>
                             <Text style={styles.routeText}>ETA: <Text style={{fontWeight: 'bold'}}>{safeWindow.estimated_duration_minutes} min</Text></Text>
                             {safeWindow.estimated_arrival_at && (
                               <Text style={styles.routeText}>Expected arrival: <Text style={{fontWeight: 'bold'}}>{new Date(safeWindow.estimated_arrival_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</Text></Text>
                             )}
                           </View>
                         ) : null
                       ) : safeWindow.route_status === 'approximate' ? (
                           safeWindow.distance_km != null ? (
                               <Text style={styles.routeText}>Distance: <Text style={{fontWeight: 'bold'}}>~{safeWindow.distance_km} km</Text> (approximate)</Text>
                           ) : null
                       ) : safeWindow.route_status === 'unavailable' || safeWindow.route_status === 'api_error' || safeWindow.route_status === 'api_key_missing' ? (
                           null
                       ) : null}
                       
                       {safeWindow.routeDeviationWarningAt && !safeWindow.routeDeviationDetected && (
                         <View style={styles.warningBox}>
                           <Text style={styles.warningTitle}>Route Deviation Warning</Text>
                           <Text style={styles.warningText}>You appear to be off route. Alerting guardians in {warningTimeLeft}s.</Text>
                           <View style={{flexDirection: 'row', gap: 10, marginTop: 10}}>
                             <PrimaryButton title="I'm OK" variant="primary" onPress={cancelDeviationWarning} style={{flex: 1}} />
                             <PrimaryButton title="Update Route" variant="outline" onPress={resumeRoute} style={{flex: 1}} />
                           </View>
                         </View>
                       )}
                       
                       {batteryOptimizationDenied && (
                         <View style={styles.warningBox}>
                           <Text style={styles.warningTitle}>⚠️ Tracking Reliability Reduced</Text>
                           <Text style={styles.warningText}>SafeHer may be killed by your phone when the screen is off. Please exempt it from battery optimizations.</Text>
                           <PrimaryButton title="Fix Settings" variant="outline" onPress={openBatterySettings} style={{marginTop: 10}} />
                         </View>
                       )}

                       {safeWindow.routeDeviationDetected && (
                         <View style={styles.deviationBox}>
                           <Text style={styles.deviationText}>Deviation Detected! Immediate check-in required.</Text>
                         </View>
                       )}
                      </View>
                     )}
                  </View>

                  <PrimaryButton title={isCompleting ? "Ending..." : "End Journey"} variant="outline" onPress={handleEnd} disabled={isCompleting} style={styles.endBtn} />
                </View>
              ) : (
                <View style={styles.activeSection}>
                  <View style={styles.errorCard}>
                     <Text style={styles.errorIcon}>⚠️</Text>
                     <Text style={styles.errorTitle}>Emergency Alert Sent</Text>
                     <Text style={styles.errorText}>You missed your check-in or deviated from your route. An emergency alert has been triggered and the system is attempting to notify your guardians.</Text>
                  </View>

                  <PrimaryButton title="Cancel Alarm & End Journey" variant="outline" onPress={handleEnd} style={styles.endBtn} />
                </View>
              )}
            </>
          ) : (
            <View style={styles.optionsSection}>
              {errorBanner && (
                <View style={styles.errorBannerCard}>
                  <Text style={styles.errorBannerIcon}>❌</Text>
                  <Text style={styles.errorBannerText}>{errorBanner}</Text>
                </View>
              )}
              <View style={styles.card}>
                <SectionHeader title="Route Setup" subtitle="Let SafeHer monitor your journey." />
                {isUsingNominatim && (
                  <Text style={{ fontSize: 12, color: '#64748B', fontStyle: 'italic', marginBottom: 10, textAlign: 'center' }}>
                    Using OpenStreetMap location search.
                  </Text>
                )}
                <View style={styles.routeForm}>
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>From</Text>
                    <View style={{flexDirection: 'row', marginBottom: 8}}>
                       <TouchableOpacity onPress={() => setUseCurrentLocation(true)} style={[styles.chip, useCurrentLocation && styles.chipSelected, {flex: 1, marginRight: 4}]}>
                         <Text style={useCurrentLocation ? styles.chipTextSelected : styles.chipText}>Current Location</Text>
                       </TouchableOpacity>
                       <TouchableOpacity onPress={() => setUseCurrentLocation(false)} style={[styles.chip, !useCurrentLocation && styles.chipSelected, {flex: 1, marginLeft: 4}]}>
                         <Text style={!useCurrentLocation ? styles.chipTextSelected : styles.chipText}>Manual Search</Text>
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
                        <View>
                          <TextInput 
                            style={styles.searchInput} 
                            placeholder="Search starting location..." 
                            placeholderTextColor="#94A3B8" 
                            value={fromQuery} 
                            onChangeText={(t) => handleSearch(t, 'from')}
                            onFocus={() => {
                              if (fromQuery === '') {
                                handleSearch('', 'from');
                              } else {
                                setSearchTarget('from');
                              }
                            }}
                          />
                          {isSearching && searchTarget === 'from' && <ActivityIndicator style={{marginTop: 8}} color="#4F46E5" />}
                          {searchResults.length > 0 && searchTarget === 'from' && (
                            <View style={styles.resultsContainer}>
                              {searchResults.map(result => (
                                <TouchableOpacity key={result.id} style={styles.resultItem} onPress={() => handleSelectPlace(result)}>
                                  <Text style={styles.resultName}>{result.name}</Text>
                                  <Text style={styles.resultDesc}>{result.description}</Text>
                                </TouchableOpacity>
                              ))}
                            </View>
                          )}
                        </View>
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
                    <Text style={styles.inputLabel}>To (Optional)</Text>
                    {!destPlace ? (
                      <View>
                        <TextInput 
                          style={styles.searchInput} 
                          placeholder="Search destination..." 
                          placeholderTextColor="#94A3B8" 
                          value={toQuery} 
                          onChangeText={(t) => handleSearch(t, 'to')}
                          onFocus={() => {
                            if (toQuery === '') {
                              handleSearch('', 'to');
                            } else {
                              setSearchTarget('to');
                            }
                          }}
                        />
                        {isSearching && searchTarget === 'to' && <ActivityIndicator style={{marginTop: 8}} color="#4F46E5" />}
                        {searchResults.length > 0 && searchTarget === 'to' && (
                          <View style={styles.resultsContainer}>
                            {searchResults.map(result => (
                              <TouchableOpacity key={result.id} style={styles.resultItem} onPress={() => handleSelectPlace(result)}>
                                <Text style={styles.resultName}>{result.name}</Text>
                                <Text style={styles.resultDesc}>{result.description}</Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        )}
                      </View>
                    ) : (
                      <View style={styles.selectedPlaceCard}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.selectedPlaceName}>{destPlace.name}</Text>
                          <Text style={styles.selectedPlaceDesc}>{destPlace.description}</Text>
                        </View>
                        <TouchableOpacity onPress={() => clearSelection('to')} style={styles.clearBtn}>
                          <Text style={styles.clearText}>Clear</Text>
                        </TouchableOpacity>
                      </View>
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
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FAFAF9' },
  container: { flexGrow: 1, padding: 24, paddingTop: Platform.OS === 'ios' ? 20 : 60 },
  header: { marginBottom: 24 },
  title: { fontSize: 32, fontWeight: '900', color: '#1E293B', marginBottom: 8, letterSpacing: -0.5 },
  subtitle: { fontSize: 16, color: '#64748B', fontWeight: '500', lineHeight: 22 },
  card: {
    backgroundColor: '#FFFFFF', padding: 24, borderRadius: 20, marginBottom: 16,
    shadowColor: '#1E293B', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2,
    borderWidth: 1, borderColor: '#F1F5F9'
  },
  statusCard: {
    backgroundColor: '#FFFFFF', padding: 20, borderRadius: 16, marginBottom: 16,
    shadowColor: '#1E293B', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2,
    borderWidth: 1, borderColor: '#F1F5F9'
  },
  statusCardError: {
    backgroundColor: '#FEF2F2', borderColor: '#FECACA'
  },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontSize: 16, fontWeight: '800', color: '#1E293B' },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  badgeActive: { backgroundColor: '#EEF2FF' },
  badgeError: { backgroundColor: '#FEE2E2' },
  statusText: { fontSize: 13, fontWeight: '800', textTransform: 'uppercase' },
  textActive: { color: '#4F46E5' },
  textError: { color: '#DC2626' },
  activeSection: { alignItems: 'center', marginBottom: 24, marginTop: 8 },
  timerCircle: { 
    width: 140, height: 140, borderRadius: 70, backgroundColor: '#EEF2FF', 
    justifyContent: 'center', alignItems: 'center', marginBottom: 16, borderWidth: 4, 
    borderColor: '#C7D2FE', shadowColor: '#4F46E5', shadowOffset: { width: 0, height: 4 }, 
    shadowOpacity: 0.1, shadowRadius: 10, elevation: 4 
  },
  countdownTitle: { fontSize: 13, color: '#64748B', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  countdown: { fontSize: 36, fontWeight: '800', color: '#4F46E5' },
  nextCheckInBox: { backgroundColor: '#FEF3C7', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12, alignItems: 'center', marginBottom: 16, width: '100%' },
  deviationAlertBox: { backgroundColor: '#FEE2E2', borderColor: '#F87171', borderWidth: 2 },
  checkInLabel: { fontSize: 14, color: '#B45309', fontWeight: '700', marginBottom: 4 },
  checkInCountdown: { fontSize: 32, fontWeight: '800', color: '#D97706' },
  checkInSection: { marginBottom: 20 },
  sectionLabel: { fontSize: 14, fontWeight: '700', color: '#64748B', marginBottom: 8 },
  chipRow: { flexDirection: 'row', gap: 8 },
  chip: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0' },
  chipSelected: { backgroundColor: '#4F46E5', borderColor: '#4F46E5' },
  chipText: { fontSize: 14, fontWeight: '600', color: '#475569' },
  chipTextSelected: { fontSize: 14, fontWeight: '600', color: '#FFFFFF' },
  optionsSection: { marginTop: 8 },
  buttonGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  gridButton: { width: '48%', marginBottom: 12 },
  errorCard: { backgroundColor: '#FEF2F2', borderColor: '#FECACA', borderWidth: 1, padding: 24, borderRadius: 16, width: '100%', marginBottom: 24, alignItems: 'center' },
  errorIcon: { fontSize: 48, marginBottom: 12 },
  errorTitle: { fontSize: 20, fontWeight: '800', color: '#DC2626', marginBottom: 8, textAlign: 'center' },
  errorText: { fontSize: 15, color: '#991B1B', textAlign: 'center', lineHeight: 22 },
  riskCard: { backgroundColor: '#FFFFFF', padding: 16, borderRadius: 12, width: '100%', marginBottom: 12, borderWidth: 1, borderColor: '#F1F5F9' },
  riskHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  riskTitle: { fontSize: 14, fontWeight: '700', color: '#334155' },
  riskBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  riskBadgeLow: { backgroundColor: '#F0FDF4' },
  riskBadgeHigh: { backgroundColor: '#FEF2F2' },
  riskValue: { fontSize: 13, fontWeight: '700' },
  riskLow: { color: '#166534' },
  riskHigh: { color: '#991B1B' },
  routeCard: { backgroundColor: '#F8FAFC', padding: 16, borderRadius: 12, width: '100%', marginBottom: 20, borderWidth: 1, borderColor: '#E2E8F0' },
  routeHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  routeIcon: { fontSize: 18, marginRight: 8 },
  routeTitle: { fontSize: 15, fontWeight: '700', color: '#1E293B' },
  routeText: { fontSize: 14, color: '#475569' },
  deviationBox: { marginTop: 12, backgroundColor: '#FEF2F2', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#FECACA' },
  deviationText: { color: '#DC2626', fontWeight: '700', fontSize: 14 },
  warningBox: { marginTop: 12, backgroundColor: '#FFF7ED', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#FFEDD5' },
  warningTitle: { color: '#C2410C', fontWeight: '800', fontSize: 14, marginBottom: 4 },
  warningText: { color: '#9A3412', fontSize: 13 },
  endBtn: { width: '100%' },
  routeForm: { marginTop: 8 },
  inputGroup: { marginBottom: 16 },
  inputLabel: { fontSize: 13, fontWeight: '700', color: '#64748B', marginBottom: 8, textTransform: 'uppercase' },
  searchInput: { backgroundColor: '#F8FAFC', padding: 16, borderRadius: 12, color: '#1E293B', borderWidth: 1, borderColor: '#E2E8F0', fontSize: 16, fontWeight: '500' },
  readOnlyInput: { backgroundColor: '#F1F5F9', color: '#475569' },
  providerWarningText: { fontSize: 12, color: '#94A3B8', fontStyle: 'italic', marginTop: 8 },
  resultsContainer: { marginTop: 8, backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', overflow: 'hidden', shadowColor: '#1E293B', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
  resultItem: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  resultName: { fontSize: 16, fontWeight: '700', color: '#1E293B' },
  resultDesc: { fontSize: 14, color: '#64748B', marginTop: 4 },
  selectedPlaceCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#EEF2FF', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#C7D2FE' },
  selectedPlaceName: { fontSize: 16, fontWeight: '800', color: '#3730A3' },
  selectedPlaceDesc: { fontSize: 14, color: '#4F46E5', marginTop: 4 },
  clearBtn: { backgroundColor: '#FFFFFF', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#C7D2FE' },
  clearText: { color: '#4F46E5', fontWeight: '800', fontSize: 12, textTransform: 'uppercase' },
  errorBannerCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEF2F2', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#FECACA', marginBottom: 16 },
  errorBannerIcon: { fontSize: 20, marginRight: 12 },
  errorBannerText: { fontSize: 14, color: '#991B1B', flex: 1, fontWeight: '600' }
});

