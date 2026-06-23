import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { useContacts } from '../context/ContactsContext';
import { useSafeWindow } from '../context/SafeWindowContext';
import { PrimaryButton } from '../components/PrimaryButton';
import { SafetyCard } from '../components/SafetyCard';
import { QuickActionCard } from '../components/QuickActionCard';
import { SOSButton } from '../components/SOSButton';
import { useAlert } from '../context/AlertContext';
import { SectionHeader } from '../components/SectionHeader';
import { supabase } from '../lib/supabaseClient';

type HomeScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Home'>;

export default function HomeScreen() {
  const navigation = useNavigation<HomeScreenNavigationProp>();
  const { contacts } = useContacts();
  const { safeWindow } = useSafeWindow();
  const { createAlert } = useAlert();
  const [session, setSession] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
  }, []);

  const handleManualSOS = () => {
    navigation.navigate('SOS');
  };

  const getSafeWindowStatusText = () => {
    switch (safeWindow.status) {
      case 'ACTIVE': return 'Active';
      case 'COMPLETED': return 'Completed';
      case 'MISSED_CHECKIN': return 'Missed Check-in';
      default: return 'Inactive';
    }
  };

  const isSynced = !!session;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>SafeHer</Text>
            <Text style={styles.subtitle}>Emergency help, quietly when needed.</Text>
          </View>
          <View style={styles.pillsContainer}>
             {/* Technical sync pill removed from home screen per PRD */}
          </View>
        </View>

        <View style={styles.sosContainer}>
          <SOSButton 
            title="SOS" 
            subtitle="Slide or Tap to Alert" 
            onPress={handleManualSOS} 
          />
          <PrimaryButton 
            title="Trigger Silent SOS" 
            variant="dark" 
            onPress={() => navigation.navigate('SilentSOS')} 
            style={styles.silentButton}
          />
        </View>

        <SectionHeader title="Active Protection" subtitle="Monitoring your safety status" />
        
        <SafetyCard
          title="Journey Mode"
          subtitle="Share your route with trusted guardians"
          status={getSafeWindowStatusText()}
          onPress={() => navigation.navigate('SafeWindow')}
        />

        <SectionHeader title="Quick Actions" />

        <QuickActionCard
          title="Check-In Timer"
          subtitle="Set a timer during travel"
          icon="⏳"
          onPress={() => navigation.navigate('DeadManCheckIn')}
        />
        <QuickActionCard
          title="Trusted Guardians"
          subtitle={`${contacts.length} guardians active`}
          icon="🛡️"
          onPress={() => navigation.navigate('Contacts')}
        />
        <QuickActionCard
          title="Alert History"
          subtitle="Review past events"
          icon="📋"
          onPress={() => navigation.navigate('AlertHistory')}
        />
        <QuickActionCard
          title="Privacy & Safety"
          subtitle="PINs, account, and preferences"
          icon="⚙️"
          onPress={() => navigation.navigate('Settings')}
        />
        
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { 
    flex: 1, 
    backgroundColor: '#FAFAF9' 
  },
  container: { 
    padding: 24, 
    paddingTop: Platform.OS === 'ios' ? 20 : 60, 
    paddingBottom: 48 
  },
  header: { 
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 40 
  },
  title: { 
    fontSize: 28, 
    fontWeight: '900', 
    color: '#1E293B', 
    marginBottom: 4,
    letterSpacing: -0.5,
  },
  subtitle: { 
    fontSize: 15, 
    color: '#64748B',
    fontWeight: '500',
  },
  pillsContainer: {
    alignItems: 'flex-end',
    gap: 8,
  },
  sosContainer: { 
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 20,
    backgroundColor: '#FFFFFF',
    padding: 30,
    borderRadius: 32,
    shadowColor: '#1E293B',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.05,
    shadowRadius: 20,
    elevation: 5,
  },
  silentButton: {
    marginTop: 24,
    width: '100%',
  },
});
