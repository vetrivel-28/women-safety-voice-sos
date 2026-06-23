import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, Platform, Alert } from 'react-native';
import { supabase } from '../lib/supabaseClient';
import { PrimaryButton } from '../components/PrimaryButton';
import { SectionHeader } from '../components/SectionHeader';

export const SettingsScreen: React.FC = () => {
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.email) {
        setUserEmail(session.user.email);
      }
    });
  }, []);

  const handleLogout = () => {
    Alert.alert(
      'Log Out',
      'Are you sure you want to log out?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Log Out', 
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.auth.signOut();
            if (error) {
              Alert.alert('Error', error.message);
            }
          }
        }
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        
        <View style={styles.header}>
          <Text style={styles.title}>Settings</Text>
          <Text style={styles.subtitle}>App preferences and account.</Text>
        </View>

        <SectionHeader title="Account" />
        <View style={styles.card}>
          <View style={styles.accountRow}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarText}>{userEmail ? userEmail.charAt(0).toUpperCase() : 'U'}</Text>
            </View>
            <View>
              <Text style={styles.userEmail}>{userEmail || 'Local Guest'}</Text>
              <Text style={styles.userStatus}>Status: {userEmail ? 'Verified Account' : 'Demo Mode'}</Text>
            </View>
          </View>
          <PrimaryButton title="Log Out" variant="danger" onPress={handleLogout} style={{marginTop: 16}} />
        </View>

        <SectionHeader title="Security & PINs" />
        <View style={styles.card}>
          <Text style={styles.listItem}>• Cancel PIN: <Text style={styles.bold}>1234</Text></Text>
          <Text style={styles.listItem}>• Duress PIN: <Text style={styles.bold}>4321</Text></Text>
          <Text style={styles.listItem}>Duress PIN can make the phone look safe while keeping help active behind the scenes.</Text>
          <View style={styles.noteBox}>
             <Text style={styles.noteText}>These are demo values for V1 testing.</Text>
          </View>
        </View>

        <SectionHeader title="Privacy Info" />
        <View style={styles.card}>
          <Text style={styles.listItem}>SafeHer does not use always-on microphone or camera in this version.</Text>
          <Text style={styles.listItem}>Location is only shared during SOS, Journey Mode, and active alerts to protect your privacy.</Text>
        </View>

        <SectionHeader title="Sync & Storage" />
        <View style={styles.card}>
          <Text style={styles.listItem}>If network is unavailable, SafeHer keeps the alert locally and retries sync automatically.</Text>
        </View>

        <SectionHeader title="Safety Preferences" />
        <View style={styles.card}>
          <Text style={styles.toggleTitle}>Silent Alerts</Text>
          <Text style={styles.toggleDesc}>Silent alerts are designed for situations where a visible alarm may be unsafe. Guardians are notified quietly.</Text>
          <View style={styles.divider} />
          <Text style={styles.toggleTitle}>Shake Trigger (Coming Soon)</Text>
          <Text style={styles.toggleDesc}>Future option: Shake device to trigger SOS (Requires sensor update).</Text>
          <View style={styles.divider} />
          <Text style={styles.toggleTitle}>Voice Guard (Coming Soon)</Text>
          <Text style={styles.toggleDesc}>Future option: Voice Guard is off by default and future-ready.</Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FAFAF9' },
  container: { flexGrow: 1, padding: 24, paddingTop: Platform.OS === 'ios' ? 20 : 60 },
  header: { marginBottom: 16 },
  title: { fontSize: 32, fontWeight: '900', color: '#1E293B', marginBottom: 4, letterSpacing: -0.5 },
  subtitle: { fontSize: 16, color: '#64748B', fontWeight: '500' },
  card: {
    backgroundColor: '#FFFFFF', padding: 24, borderRadius: 20, marginBottom: 24,
    shadowColor: '#1E293B', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2,
    borderWidth: 1, borderColor: '#F1F5F9'
  },
  accountRow: { flexDirection: 'row', alignItems: 'center' },
  avatarCircle: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  avatarText: { fontSize: 24, fontWeight: '800', color: '#4F46E5' },
  userEmail: { fontSize: 16, fontWeight: '700', color: '#1E293B', marginBottom: 4 },
  userStatus: { fontSize: 13, color: '#16A34A', fontWeight: '600' },
  listItem: { fontSize: 15, color: '#475569', marginBottom: 12, lineHeight: 22 },
  bold: { fontWeight: '700', color: '#1E293B' },
  noteBox: { backgroundColor: '#F8FAFC', padding: 12, borderRadius: 8, marginTop: 8 },
  noteText: { fontSize: 13, color: '#64748B', fontStyle: 'italic', textAlign: 'center' },
  toggleTitle: { fontSize: 15, fontWeight: '700', color: '#1E293B', marginBottom: 4 },
  toggleDesc: { fontSize: 13, color: '#64748B', lineHeight: 18 },
  divider: { height: 1, backgroundColor: '#E2E8F0', marginVertical: 16 }
});
