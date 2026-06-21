import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView } from 'react-native';
import { useSafeWindow } from '../context/SafeWindowContext';
import { PrimaryButton } from '../components/PrimaryButton';

export const SafeWindowScreen: React.FC = () => {
  const { safeWindow, startSafeWindow, endSafeWindow, getRemainingSeconds, getCheckInRemainingSeconds } = useSafeWindow();
  
  const [timeLeft, setTimeLeft] = useState(getRemainingSeconds());
  const [checkInTimeLeft, setCheckInTimeLeft] = useState(getCheckInRemainingSeconds());

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

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Safe Window</Text>
        <Text style={styles.subtitle}>Start a temporary safety monitoring period.</Text>

        <View style={styles.statusCard}>
          <Text style={styles.statusHeader}>Current Status</Text>
          <View style={styles.statusRow}>
            <Text style={styles.label}>Status:</Text>
            <Text style={[
              styles.value, 
              safeWindow.status === 'ACTIVE' && styles.activeValue, 
              safeWindow.status === 'MISSED_CHECKIN' && styles.errorValue
            ]}>
              {safeWindow.status === 'ACTIVE' ? 'Active' : 
               safeWindow.status === 'INACTIVE' ? 'Inactive' : 
               safeWindow.status === 'COMPLETED' ? 'Completed' : 'Missed Check-in'}
            </Text>
          </View>
          {safeWindow.startedAt && (
            <View style={styles.statusRow}>
              <Text style={styles.label}>Started at:</Text>
              <Text style={styles.value}>{new Date(safeWindow.startedAt).toLocaleTimeString()}</Text>
            </View>
          )}
          {safeWindow.endsAt && (
            <View style={styles.statusRow}>
              <Text style={styles.label}>Ends at:</Text>
              <Text style={styles.value}>{new Date(safeWindow.endsAt).toLocaleTimeString()}</Text>
            </View>
          )}
          {safeWindow.demoMode && (
            <View style={styles.demoBadge}>
              <Text style={styles.demoBadgeText}>Demo Mode Active</Text>
            </View>
          )}
        </View>

        {safeWindow.status === 'ACTIVE' ? (
          <View style={styles.activeSection}>
            <Text style={styles.countdownTitle}>Window Time Remaining:</Text>
            <Text style={styles.countdown}>{formatTime(timeLeft)}</Text>
            
            <Text style={styles.countdownTitle}>Check-in due in:</Text>
            <Text style={styles.checkInCountdown}>{formatTime(checkInTimeLeft)}</Text>
            
            <Text style={styles.note}>
              Dead Man Check-in will ask for confirmation during this window.
            </Text>
            <PrimaryButton title="End Safe Window" variant="normal" onPress={endSafeWindow} />
          </View>
        ) : safeWindow.status === 'MISSED_CHECKIN' ? (
          <View style={styles.activeSection}>
            <View style={styles.errorCard}>
              <Text style={styles.errorTitle}>Missed check-in detected.</Text>
              <Text style={styles.errorText}>Silent SOS integration pending until Person A’s AlertContext is merged.</Text>
            </View>
            <PrimaryButton title="End Safe Window" variant="normal" onPress={endSafeWindow} />
          </View>
        ) : (
          <View style={styles.optionsSection}>
            <Text style={styles.sectionTitle}>Select Duration</Text>
            <PrimaryButton title="15 minutes" onPress={() => startSafeWindow(15)} variant="dark" />
            <PrimaryButton title="30 minutes" onPress={() => startSafeWindow(30)} variant="dark" />
            <PrimaryButton title="60 minutes" onPress={() => startSafeWindow(60)} variant="dark" />
            <View style={{ height: 16 }} />
            <PrimaryButton title="Demo 30 seconds" onPress={() => startSafeWindow(0.5)} variant="warning" />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FFF7F7' },
  container: { flexGrow: 1, padding: 24 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#111827', marginBottom: 4 },
  subtitle: { fontSize: 16, color: '#6B7280', marginBottom: 24 },
  statusCard: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 1
  },
  statusHeader: { fontSize: 18, fontWeight: 'bold', color: '#111827', marginBottom: 12 },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  label: { fontSize: 15, color: '#4B5563' },
  value: { fontSize: 15, color: '#111827', fontWeight: '500' },
  activeValue: { color: '#16A34A', fontWeight: 'bold' },
  errorValue: { color: '#DC2626', fontWeight: 'bold' },
  demoBadge: { backgroundColor: '#FEF3C7', padding: 8, borderRadius: 8, marginTop: 12, alignItems: 'center' },
  demoBadgeText: { color: '#F59E0B', fontWeight: 'bold', fontSize: 14 },
  activeSection: { alignItems: 'center', marginTop: 8 },
  countdownTitle: { fontSize: 16, color: '#4B5563', marginBottom: 4 },
  countdown: { fontSize: 48, fontWeight: 'bold', color: '#111827', marginBottom: 16 },
  checkInCountdown: { fontSize: 32, fontWeight: 'bold', color: '#F59E0B', marginBottom: 24 },
  note: { fontSize: 14, color: '#4B5563', textAlign: 'center', marginBottom: 24, fontStyle: 'italic' },
  optionsSection: { marginTop: 8 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#111827', marginBottom: 16 },
  errorCard: { backgroundColor: '#FEF2F2', borderColor: '#FCA5A5', borderWidth: 1, padding: 16, borderRadius: 8, width: '100%', marginBottom: 24 },
  errorTitle: { fontSize: 18, fontWeight: 'bold', color: '#DC2626', marginBottom: 8, textAlign: 'center' },
  errorText: { fontSize: 14, color: '#991B1B', textAlign: 'center' },
});
