import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, Alert } from 'react-native';
import { useSafeWindow } from '../context/SafeWindowContext';
import { PrimaryButton } from '../components/PrimaryButton';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';

let useAlert: any = null;
try {
  const module = require('../context/AlertContext');
  if (module && module.useAlert) {
    useAlert = module.useAlert;
  }
} catch(e) {}

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'DeadManCheckIn'>;

export const DeadManCheckInScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const { safeWindow, markCheckInSafe, markMissedCheckIn, getCheckInRemainingSeconds } = useSafeWindow();
  
  const [timeLeft, setTimeLeft] = useState(getCheckInRemainingSeconds());

  let hasAlertContext = false;
  try {
    if (useAlert) {
      useAlert(); // test if provider is there
      hasAlertContext = true;
    }
  } catch (e) {}

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (safeWindow.status === 'ACTIVE') {
      setTimeLeft(getCheckInRemainingSeconds());
      interval = setInterval(() => {
        setTimeLeft(getCheckInRemainingSeconds());
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [safeWindow.status, safeWindow.checkInDueAt, getCheckInRemainingSeconds]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  };

  const handleSafe = () => {
    markCheckInSafe();
    Alert.alert('Check-in confirmed', 'Next check-in scheduled.');
  };

  const handleSimulateMissed = () => {
    markMissedCheckIn();
    Alert.alert('Missed check-in detected', 'Silent SOS protocol initiated.');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Dead Man Check-in</Text>
        <Text style={styles.subtitle}>Confirm you are safe during an active Safe Window.</Text>

        {safeWindow.status === 'INACTIVE' || safeWindow.status === 'COMPLETED' ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>No active Safe Window</Text>
            <Text style={styles.cardText}>Start a Safe Window first to enable check-ins.</Text>
            <View style={{ marginTop: 16 }}>
              <PrimaryButton 
                title="Go to Safe Window" 
                variant="dark" 
                onPress={() => navigation.navigate('SafeWindow')} 
              />
            </View>
          </View>
        ) : safeWindow.status === 'ACTIVE' ? (
          <View style={styles.activeContainer}>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Are you safe?</Text>
              <Text style={styles.countdownText}>
                Check-in due in: <Text style={styles.countdownNumber}>{formatTime(timeLeft)}</Text>
              </Text>
            </View>

            <PrimaryButton title="Yes, I am safe" variant="safe" onPress={handleSafe} />
            <View style={{ height: 16 }} />
            <PrimaryButton title="Simulate missed check-in" variant="warning" onPress={handleSimulateMissed} />
          </View>
        ) : safeWindow.status === 'MISSED_CHECKIN' ? (
          <View style={[styles.card, styles.errorCard]}>
            <Text style={styles.errorTitle}>Missed check-in detected</Text>
            {hasAlertContext ? (
              <Text style={styles.errorText}>Silent SOS alert has been created.</Text>
            ) : (
              <Text style={styles.errorText}>SOS integration pending until Person A’s AlertContext is merged.</Text>
            )}
          </View>
        ) : null}

      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FFF7F7' },
  container: { flexGrow: 1, padding: 24 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#111827', marginBottom: 4 },
  subtitle: { fontSize: 16, color: '#6B7280', marginBottom: 24 },
  card: {
    backgroundColor: '#FFFFFF',
    padding: 24,
    borderRadius: 12,
    marginBottom: 24,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 1
  },
  cardTitle: { fontSize: 20, fontWeight: 'bold', color: '#111827', marginBottom: 8, textAlign: 'center' },
  cardText: { fontSize: 16, color: '#4B5563', textAlign: 'center' },
  activeContainer: { marginTop: 8 },
  countdownText: { fontSize: 18, color: '#4B5563', textAlign: 'center', marginTop: 16 },
  countdownNumber: { fontWeight: 'bold', color: '#111827' },
  errorCard: { backgroundColor: '#FEF2F2', borderColor: '#FCA5A5', borderWidth: 1 },
  errorTitle: { fontSize: 20, fontWeight: 'bold', color: '#DC2626', marginBottom: 8, textAlign: 'center' },
  errorText: { fontSize: 16, color: '#991B1B', textAlign: 'center' },
});
