import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, Platform } from 'react-native';
import { useSafeWindow } from '../context/SafeWindowContext';
import { PrimaryButton } from '../components/PrimaryButton';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'DeadManCheckIn'>;

export const DeadManCheckInScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const { safeWindow, markCheckInSafe, markMissedCheckIn, getCheckInRemainingSeconds } = useSafeWindow();
  
  const [timeLeft, setTimeLeft] = useState(getCheckInRemainingSeconds());

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
    Alert.alert('Confirmed', 'Your safety is confirmed. Next check-in scheduled.');
  };

  const handleSimulateMissed = () => {
    markMissedCheckIn();
    Alert.alert('Missed check-in', 'Silent SOS has been triggered.');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>Check-In Timer</Text>
          <Text style={styles.subtitle}>Periodic safety check-ins. Missed check-ins automatically alert guardians.</Text>
        </View>

        {safeWindow.status === 'INACTIVE' || safeWindow.status === 'COMPLETED' ? (
          <View style={styles.card}>
            <View style={styles.iconCircle}>
               <Text style={styles.icon}>🕒</Text>
            </View>
            <Text style={styles.cardTitle}>No Active Timer</Text>
            <Text style={styles.cardText}>Start a Journey or a Check-In Timer to enable automatic check-ins.</Text>
            <PrimaryButton 
              title="Start Timer (via Journey Mode)" 
              variant="dark" 
              onPress={() => navigation.navigate('SafeWindow')} 
              style={{ marginTop: 24 }}
            />
          </View>
        ) : safeWindow.status === 'ACTIVE' ? (
          <View style={styles.activeContainer}>
            <View style={styles.timerCard}>
              <Text style={styles.timerSubtitle}>Check-in Required In</Text>
              <Text style={styles.timerText}>{formatTime(timeLeft)}</Text>
            </View>

            <View style={styles.actionBox}>
              <Text style={styles.actionTitle}>Are you safe?</Text>
              <Text style={styles.actionDesc}>Tap below to reset the timer and confirm your safety.</Text>
              <PrimaryButton title="Yes, I am safe" variant="primary" onPress={handleSafe} />
              
              <View style={styles.divider} />
              
              <PrimaryButton title="Trigger Alert Now" variant="outline" onPress={handleSimulateMissed} />
            </View>
            
            <View style={styles.infoBox}>
               <Text style={styles.note}>
                 If the timer expires, SafeHer will automatically alert your primary guardian.
               </Text>
            </View>
          </View>
        ) : safeWindow.status === 'MISSED_CHECKIN' ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorIcon}>⚠️</Text>
            <Text style={styles.errorTitle}>Missed Check-in</Text>
            <Text style={styles.errorText}>A Silent SOS has been triggered and the system is attempting to notify your guardians.</Text>
            <PrimaryButton 
              title="Manage Alert" 
              variant="outline" 
              onPress={() => navigation.navigate('SafeWindow')} 
              style={{ marginTop: 24 }}
            />
          </View>
        ) : null}

      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FAFAF9' },
  container: { flexGrow: 1, padding: 24, paddingTop: Platform.OS === 'ios' ? 20 : 60 },
  header: { marginBottom: 32 },
  title: { fontSize: 32, fontWeight: '900', color: '#1E293B', marginBottom: 4, letterSpacing: -0.5 },
  subtitle: { fontSize: 16, color: '#64748B', fontWeight: '500' },
  card: {
    backgroundColor: '#FFFFFF',
    padding: 32,
    borderRadius: 24,
    alignItems: 'center',
    shadowColor: '#1E293B', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.05, shadowRadius: 16, elevation: 4,
    borderWidth: 1, borderColor: '#F1F5F9'
  },
  iconCircle: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: '#EEF2FF',
    alignItems: 'center', justifyContent: 'center', marginBottom: 20
  },
  icon: { fontSize: 40 },
  cardTitle: { fontSize: 24, fontWeight: '800', color: '#1E293B', marginBottom: 12, textAlign: 'center' },
  cardText: { fontSize: 15, color: '#64748B', textAlign: 'center', lineHeight: 22 },
  activeContainer: { flex: 1 },
  timerCard: {
    backgroundColor: '#FFFBEB',
    padding: 32,
    borderRadius: 24,
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 1, borderColor: '#FEF3C7',
  },
  timerSubtitle: { fontSize: 14, color: '#B45309', fontWeight: '700', textTransform: 'uppercase', marginBottom: 8 },
  timerText: { fontSize: 56, fontWeight: '900', color: '#D97706', letterSpacing: -1 },
  actionBox: {
    backgroundColor: '#FFFFFF',
    padding: 24,
    borderRadius: 24,
    shadowColor: '#1E293B', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.05, shadowRadius: 16, elevation: 4,
    borderWidth: 1, borderColor: '#F1F5F9',
    marginBottom: 24
  },
  actionTitle: { fontSize: 20, fontWeight: '800', color: '#1E293B', marginBottom: 8, textAlign: 'center' },
  actionDesc: { fontSize: 14, color: '#64748B', textAlign: 'center', marginBottom: 24, lineHeight: 20 },
  divider: { height: 1, backgroundColor: '#F1F5F9', marginVertical: 16 },
  errorCard: {
    backgroundColor: '#FEF2F2', borderColor: '#FECACA', borderWidth: 1, padding: 32, borderRadius: 24, alignItems: 'center'
  },
  errorIcon: { fontSize: 48, marginBottom: 16 },
  errorTitle: { fontSize: 24, fontWeight: '800', color: '#DC2626', marginBottom: 12, textAlign: 'center' },
  errorText: { fontSize: 15, color: '#991B1B', textAlign: 'center', lineHeight: 22 },
  infoBox: { backgroundColor: '#F8FAFC', padding: 16, borderRadius: 12, width: '100%' },
  note: { fontSize: 14, color: '#475569', textAlign: 'center', lineHeight: 20, fontWeight: '500' },
});
