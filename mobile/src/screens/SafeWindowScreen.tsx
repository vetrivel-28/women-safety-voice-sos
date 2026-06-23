import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, Platform, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useSafeWindow } from '../context/SafeWindowContext';
import { PrimaryButton } from '../components/PrimaryButton';
import { SectionHeader } from '../components/SectionHeader';
import { getCurrentLocationForAlert } from '../utils/location';
import { searchPlaces, geocodePlace, PlaceResult } from '../services/geocodingService';
import { formatDistance } from '../utils/geoUtils';

export const SafeWindowScreen: React.FC = () => {
  const { safeWindow, startSafeWindow, endSafeWindow, getRemainingSeconds, getCheckInRemainingSeconds, markCheckInSafe, distanceToDestination } = useSafeWindow();
  
  const [timeLeft, setTimeLeft] = useState(getRemainingSeconds());
  const [checkInTimeLeft, setCheckInTimeLeft] = useState(getCheckInRemainingSeconds());
  
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PlaceResult[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<PlaceResult | null>(null);
  
  const [isStarting, setIsStarting] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (safeWindow.status === 'ACTIVE' || safeWindow.status === 'MISSED_CHECKIN') {
      setTimeLeft(getRemainingSeconds());
      setCheckInTimeLeft(getCheckInRemainingSeconds());
      
      interval = setInterval(() => {
        setTimeLeft(getRemainingSeconds());
        setCheckInTimeLeft(getCheckInRemainingSeconds());
      }, 1000);
    } else {
      setTimeLeft(0);
      setCheckInTimeLeft(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [safeWindow.status, safeWindow.endsAt, safeWindow.checkInDueAt, getRemainingSeconds, getCheckInRemainingSeconds]);

  const handleSearch = async (text: string) => {
    setSearchQuery(text);
    if (text.length > 2) {
      setIsSearching(true);
      const results = await searchPlaces(text);
      setSearchResults(results);
      setIsSearching(false);
    } else {
      setSearchResults([]);
    }
  };

  const handleSelectPlace = (place: PlaceResult) => {
    setSelectedPlace(place);
    setSearchQuery(place.name);
    setSearchResults([]);
  };

  const clearSelection = () => {
    setSelectedPlace(null);
    setSearchQuery('');
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleStart = async (minutes: 15|30|60|0.5) => {
    setIsStarting(true);
    let startLoc, destLoc;
    const locData = await getCurrentLocationForAlert();
    if (locData && !locData.permissionDenied) {
      startLoc = { latitude: locData.latitude, longitude: locData.longitude };
    }
    if (selectedPlace) {
      const coords = await geocodePlace(selectedPlace.id);
      if (coords) {
         destLoc = coords;
      } else {
         destLoc = { latitude: selectedPlace.latitude, longitude: selectedPlace.longitude };
      }
    }
    startSafeWindow(minutes, startLoc, destLoc);
    setIsStarting(false);
  };

  const calculateRiskScore = () => {
    if (safeWindow.status === 'MISSED_CHECKIN') return 'HIGH';
    if (safeWindow.routeDeviationDetected) return 'HIGH';
    return 'LOW';
  };

  const riskScore = calculateRiskScore();

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>Journey Mode</Text>
          <Text style={styles.subtitle}>Route monitoring with automatic guardian updates if you deviate or fail to check in.</Text>
        </View>

        {safeWindow.status === 'ACTIVE' || safeWindow.status === 'MISSED_CHECKIN' ? (
          <>
            <View style={styles.statusCard}>
              <View style={styles.statusRow}>
                <Text style={styles.label}>Journey Status</Text>
                <View style={[styles.statusBadge, 
                    safeWindow.status === 'ACTIVE' ? styles.badgeActive : 
                    styles.badgeError]}>
                  <Text style={[styles.statusText, 
                      safeWindow.status === 'ACTIVE' ? styles.textActive : 
                      styles.textError]}>
                    {safeWindow.status === 'ACTIVE' ? 'Active Tracking' : 'Missed Check-in'}
                  </Text>
                </View>
              </View>
            </View>

            {safeWindow.status === 'ACTIVE' ? (
              <View style={styles.activeSection}>
                <View style={styles.timerCircle}>
                  <Text style={styles.countdownTitle}>Window Time</Text>
                  <Text style={styles.countdown}>{formatTime(timeLeft)}</Text>
                </View>
                
                <View style={styles.nextCheckInBox}>
                  <Text style={styles.checkInLabel}>Check-in Required In</Text>
                  <Text style={styles.checkInCountdown}>{formatTime(checkInTimeLeft)}</Text>
                </View>
                
                <PrimaryButton title="I'm Safe (Check-in)" variant="primary" onPress={markCheckInSafe} style={{width: '100%', marginBottom: 16}} />

                <View style={styles.riskCard}>
                   <View style={styles.riskHeader}>
                     <Text style={styles.riskTitle}>Status</Text>
                     <View style={[styles.riskBadge, riskScore === 'LOW' ? styles.riskBadgeLow : styles.riskBadgeHigh]}>
                       <Text style={[styles.riskValue, riskScore === 'LOW' ? styles.riskLow : styles.riskHigh]}>
                         {riskScore === 'LOW' ? 'Normal' : 'High Risk'}
                       </Text>
                     </View>
                   </View>
                </View>

                {safeWindow.destinationLocation && (
                  <View style={styles.routeCard}>
                     <View style={styles.routeHeader}>
                        <Text style={styles.routeIcon}>📍</Text>
                        <Text style={styles.routeTitle}>Route Tracking Active</Text>
                     </View>
                     <Text style={styles.routeText}>Distance to destination: <Text style={{fontWeight: 'bold'}}>{formatDistance(distanceToDestination)}</Text></Text>
                     {safeWindow.routeDeviationDetected && (
                       <View style={styles.deviationBox}>
                         <Text style={styles.deviationText}>Deviation Detected! Immediate check-in required.</Text>
                       </View>
                     )}
                  </View>
                )}

                <PrimaryButton title="End Journey" variant="outline" onPress={endSafeWindow} style={styles.endBtn} />
              </View>
            ) : (
              <View style={styles.activeSection}>
                <View style={styles.errorCard}>
                   <Text style={styles.errorIcon}>⚠️</Text>
                   <Text style={styles.errorTitle}>Emergency Alert Sent</Text>
                   <Text style={styles.errorText}>You missed your check-in or deviated from your route. Your guardians have been notified.</Text>
                </View>

                <PrimaryButton title="Cancel Alarm & End Journey" variant="outline" onPress={endSafeWindow} style={styles.endBtn} />
              </View>
            )}
          </>
        ) : (
          <View style={styles.optionsSection}>
            <View style={styles.card}>
              <SectionHeader title="Where are you going?" subtitle="Optional. Enables route deviation detection." />
              
              {!selectedPlace ? (
                <View>
                  <TextInput 
                    style={styles.searchInput} 
                    placeholder="Search destination..." 
                    placeholderTextColor="#94A3B8" 
                    value={searchQuery} 
                    onChangeText={handleSearch} 
                  />
                  {isSearching && <ActivityIndicator style={{marginTop: 8}} color="#4F46E5" />}
                  {searchResults.length > 0 && (
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
                  <View>
                    <Text style={styles.selectedPlaceName}>{selectedPlace.name}</Text>
                    <Text style={styles.selectedPlaceDesc}>{selectedPlace.description}</Text>
                  </View>
                  <TouchableOpacity onPress={clearSelection}>
                    <Text style={styles.clearText}>Clear</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            <View style={styles.card}>
              <SectionHeader title="Start Journey" subtitle="Select monitoring duration" />
              <View style={styles.buttonGrid}>
                <PrimaryButton style={styles.gridButton} title="15 min" disabled={isStarting} onPress={() => handleStart(15)} variant="dark" />
                <PrimaryButton style={styles.gridButton} title="30 min" disabled={isStarting} onPress={() => handleStart(30)} variant="dark" />
                <PrimaryButton style={styles.gridButton} title="60 min" disabled={isStarting} onPress={() => handleStart(60)} variant="dark" />
                <PrimaryButton style={styles.gridButton} title="Demo (30s)" disabled={isStarting} onPress={() => handleStart(0.5)} variant="outline" />
              </View>
            </View>
          </View>
        )}
      </ScrollView>
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
    backgroundColor: '#FFFFFF', padding: 20, borderRadius: 16, marginBottom: 16,
    shadowColor: '#1E293B', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2,
    borderWidth: 1, borderColor: '#F1F5F9'
  },
  statusCard: {
    backgroundColor: '#FFFFFF', padding: 16, borderRadius: 16, marginBottom: 16,
    shadowColor: '#1E293B', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2,
    borderWidth: 1, borderColor: '#F1F5F9'
  },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontSize: 16, fontWeight: '700', color: '#1E293B' },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  badgeActive: { backgroundColor: '#EEF2FF' },
  badgeError: { backgroundColor: '#FEE2E2' },
  statusText: { fontSize: 13, fontWeight: '800', textTransform: 'uppercase' },
  textActive: { color: '#4F46E5' },
  textError: { color: '#DC2626' },
  activeSection: { alignItems: 'center', marginTop: 8 },
  timerCircle: {
    width: 180, height: 180, borderRadius: 90, backgroundColor: '#FFFFFF',
    borderWidth: 6, borderColor: '#EEF2FF',
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
    shadowColor: '#4F46E5', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.1, shadowRadius: 16, elevation: 4
  },
  countdownTitle: { fontSize: 13, color: '#64748B', fontWeight: '600', textTransform: 'uppercase', marginBottom: 4 },
  countdown: { fontSize: 44, fontWeight: '900', color: '#1E293B' },
  nextCheckInBox: {
    backgroundColor: '#FFFBEB', padding: 16, borderRadius: 12, width: '100%', alignItems: 'center', marginBottom: 20,
    borderWidth: 1, borderColor: '#FEF3C7'
  },
  checkInLabel: { fontSize: 14, color: '#B45309', fontWeight: '700', marginBottom: 4 },
  checkInCountdown: { fontSize: 32, fontWeight: '800', color: '#D97706' },
  optionsSection: { marginTop: 8 },
  buttonGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  gridButton: { width: '48%', marginBottom: 12 },
  errorCard: { backgroundColor: '#FEF2F2', borderColor: '#FECACA', borderWidth: 1, padding: 24, borderRadius: 16, width: '100%', marginBottom: 24, alignItems: 'center' },
  errorIcon: { fontSize: 48, marginBottom: 12 },
  errorTitle: { fontSize: 20, fontWeight: '800', color: '#DC2626', marginBottom: 8, textAlign: 'center' },
  errorText: { fontSize: 15, color: '#991B1B', textAlign: 'center', lineHeight: 22 },
  riskCard: { backgroundColor: '#FFFFFF', padding: 16, borderRadius: 12, width: '100%', marginBottom: 12, borderWidth: 1, borderColor: '#F1F5F9' },
  riskHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  riskTitle: { fontSize: 14, fontWeight: '600', color: '#334155' },
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
  deviationBox: { marginTop: 12, backgroundColor: '#FEF2F2', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#FECACA' },
  deviationText: { color: '#DC2626', fontWeight: '700', fontSize: 13 },
  endBtn: { width: '100%' },
  searchInput: { backgroundColor: '#F8FAFC', padding: 14, borderRadius: 10, color: '#1E293B', borderWidth: 1, borderColor: '#E2E8F0', fontSize: 15 },
  resultsContainer: { marginTop: 8, backgroundColor: '#FFFFFF', borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0', overflow: 'hidden' },
  resultItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  resultName: { fontSize: 15, fontWeight: '600', color: '#1E293B' },
  resultDesc: { fontSize: 13, color: '#64748B', marginTop: 2 },
  selectedPlaceCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#EEF2FF', padding: 14, borderRadius: 10, borderWidth: 1, borderColor: '#C7D2FE' },
  selectedPlaceName: { fontSize: 15, fontWeight: '700', color: '#3730A3' },
  selectedPlaceDesc: { fontSize: 13, color: '#4F46E5', marginTop: 2 },
  clearText: { color: '#4F46E5', fontWeight: '700', fontSize: 14, padding: 8 }
});
