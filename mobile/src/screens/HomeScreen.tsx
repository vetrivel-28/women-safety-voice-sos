import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { useAlert } from '../context/AlertContext';
import { useContacts } from '../context/ContactsContext';

type HomeScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Home'>;

const PrimaryButton = ({ title, variant, onPress }: { title: string, variant: 'emergency'|'dark', onPress: () => void }) => (
  <TouchableOpacity style={[styles.button, variant === 'emergency' ? styles.emergencyBtn : styles.darkBtn]} onPress={onPress}>
    <Text style={styles.buttonText}>{title}</Text>
  </TouchableOpacity>
);

const SafetyCard = ({ title, subtitle, status, onPress }: { title: string, subtitle: string, status?: string, onPress: () => void }) => (
  <TouchableOpacity style={styles.card} onPress={onPress}>
    <View style={styles.cardHeader}>
      <Text style={styles.cardTitle}>{title}</Text>
      {status && <Text style={styles.statusPillSmall}>{status}</Text>}
    </View>
    <Text style={styles.cardSubtitle}>{subtitle}</Text>
  </TouchableOpacity>
);

export default function HomeScreen() {
  const navigation = useNavigation<HomeScreenNavigationProp>();
  const { alerts } = useAlert();
  const { contacts } = useContacts();

  const contactsStatus = contacts.length === 1 
    ? '1 contact added' 
    : `${contacts.length} contacts added`;

  const alertsStatus = alerts.length === 0 
    ? 'No alerts yet' 
    : `${alerts.length} alerts recorded`;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        
        {/* Top Section */}
        <View style={styles.header}>
          <Text style={styles.title}>SafeHer</Text>
          <Text style={styles.subtitle}>V1 Safety Dashboard</Text>
          <View style={styles.statusPill}>
            <Text style={styles.statusText}>Normal Mode</Text>
          </View>
          <Text style={styles.testModeText}>Expo Go phone test active</Text>
        </View>

        {/* Main Emergency Section */}
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

        {/* Feature Cards Section */}
        <View style={styles.section}>
          <SafetyCard
            title="Safe Window"
            subtitle="Schedule a safety monitoring window"
            status="Inactive"
            onPress={() => navigation.navigate('SafeWindow')}
          />
          <SafetyCard
            title="Dead Man Check-in"
            subtitle="Ask for safety confirmation during travel"
            status="Not started"
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
  safeArea: {
    flex: 1,
    backgroundColor: '#FFF7F7',
  },
  container: {
    padding: 24,
    paddingTop: 60,
    paddingBottom: 48,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 18,
    color: '#6B7280',
    marginBottom: 12,
  },
  statusPill: {
    backgroundColor: '#16A34A',
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 20,
    marginBottom: 8,
  },
  statusText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  testModeText: {
    fontSize: 12,
    color: '#6B7280',
    fontStyle: 'italic',
  },
  section: {
    marginBottom: 24,
    width: '100%',
  },
  button: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 8,
    width: '100%',
  },
  emergencyBtn: {
    backgroundColor: '#DC2626',
  },
  darkBtn: {
    backgroundColor: '#111827',
  },
  buttonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
    width: '100%',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  cardSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
  },
  statusPillSmall: {
    fontSize: 12,
    fontWeight: '500',
    color: '#F59E0B',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    overflow: 'hidden',
  },
});
