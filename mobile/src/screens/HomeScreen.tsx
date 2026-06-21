import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { useContacts } from '../context/ContactsContext';
import { useSafeWindow } from '../context/SafeWindowContext';
import { PrimaryButton } from '../components/PrimaryButton';
import { SafetyCard } from '../components/SafetyCard';

// Safely isolate Person A's AlertContext
let useAlert: any = null;
try {
  useAlert = require('../context/AlertContext').useAlert;
} catch (e) {
  // AlertContext not ready
}

type HomeScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Home'>;

export default function HomeScreen() {
  const navigation = useNavigation<HomeScreenNavigationProp>();
  const { contacts } = useContacts();
  const { safeWindow } = useSafeWindow();

  let alerts = [];
  try {
    if (useAlert) {
      const alertContext = useAlert();
      alerts = alertContext?.alerts || [];
    }
  } catch (e) {
    // Context provider not mounted yet
  }

  const contactsStatus = contacts.length === 0 
    ? '0 contacts added'
    : contacts.length === 1 
      ? '1 contact added' 
      : `${contacts.length} contacts added`;

  const alertsStatus = alerts.length === 0 
    ? 'No alerts yet' 
    : `${alerts.length} alerts recorded`;

  const getSafeWindowStatusText = () => {
    switch (safeWindow.status) {
      case 'ACTIVE': return 'Active';
      case 'COMPLETED': return 'Completed';
      case 'MISSED_CHECKIN': return 'Missed Check-in';
      default: return 'Inactive';
    }
  };

  const getDeadManStatusText = () => {
    switch (safeWindow.status) {
      case 'ACTIVE': return 'Active';
      case 'MISSED_CHECKIN': return 'Missed';
      case 'COMPLETED': return 'Completed';
      default: return 'Not started';
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        
        <View style={styles.header}>
          <Text style={styles.title}>SafeHer</Text>
          <Text style={styles.subtitle}>V1 Safety Dashboard</Text>
          <View style={styles.statusPill}>
            <Text style={styles.statusText}>Normal Mode</Text>
          </View>
          <Text style={styles.testModeText}>Expo Go phone test active</Text>
        </View>

        <View style={styles.section}>
          <PrimaryButton 
            title="Manual SOS" 
            variant="emergency" 
            onPress={() => navigation.navigate('SOS')} 
          />
          <PrimaryButton 
            title="Silent SOS" 
            variant="dark" 
            onPress={() => navigation.navigate('SilentSOS')} 
          />
        </View>

        <View style={styles.section}>
          <SafetyCard
            title="Safe Window"
            subtitle="Schedule a safety monitoring window"
            status={getSafeWindowStatusText()}
            onPress={() => navigation.navigate('SafeWindow')}
          />
          <SafetyCard
            title="Dead Man Check-in"
            subtitle="Ask for safety confirmation during travel"
            status={getDeadManStatusText()}
            onPress={() => navigation.navigate('DeadManCheckIn')}
          />
          <SafetyCard
            title="Emergency Contacts"
            subtitle="Manage trusted contacts"
            status={contactsStatus}
            onPress={() => navigation.navigate('Contacts')}
          />
          <SafetyCard
            title="Alert History"
            subtitle="View past SOS activity"
            status={alertsStatus}
            onPress={() => navigation.navigate('AlertHistory')}
          />
          <SafetyCard
            title="Settings"
            subtitle="PINs, privacy, and app preferences"
            onPress={() => navigation.navigate('Settings')}
          />
        </View>
        
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FFF7F7' },
  container: { padding: 24, paddingTop: 60, paddingBottom: 48 },
  header: { alignItems: 'center', marginBottom: 32 },
  title: { fontSize: 32, fontWeight: 'bold', color: '#111827', marginBottom: 4 },
  subtitle: { fontSize: 18, color: '#6B7280', marginBottom: 12 },
  statusPill: { backgroundColor: '#16A34A', paddingVertical: 6, paddingHorizontal: 16, borderRadius: 20, marginBottom: 8 },
  statusText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 14 },
  testModeText: { fontSize: 12, color: '#6B7280', fontStyle: 'italic' },
  section: { marginBottom: 24, width: '100%' },
});
