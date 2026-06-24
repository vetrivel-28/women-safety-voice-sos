import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, Platform, Alert, TextInput, ActivityIndicator, TouchableOpacity } from 'react-native';
import { supabase } from '../lib/supabaseClient';
import { PrimaryButton } from '../components/PrimaryButton';
import { SectionHeader } from '../components/SectionHeader';


const rawApiUrl = process.env.EXPO_PUBLIC_API_BASE_URL || process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:8000';
const API_BASE_URL = rawApiUrl.trim().replace(/\/$/, '');
console.log('API_BASE_URL =', API_BASE_URL);
export const SettingsScreen: React.FC = () => {
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [session, setSession] = useState<any>(null);

  // Profile Form State
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [bloodGroup, setBloodGroup] = useState('');
  const [medicalNotes, setMedicalNotes] = useState('');
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // --- DIAGNOSTICS ---
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const addLog = (msg: string) => {
    const time = new Date().toLocaleTimeString();
    setDebugLogs(prev => [...prev, `[${time}] ${msg}`]);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user?.email) {
        setUserEmail(session.user.email);
        fetchProfile();
      }
    });
  }, []);

  const fetchProfile = async () => {
    setIsLoadingProfile(true);
    addLog('--- FETCH PROFILE START ---');

    try {
      const { data } = await supabase.auth.getSession();
      const currentSession = data.session;
      if (!currentSession?.access_token) {
        addLog('-> FAILED: No active session found');
        setIsLoadingProfile(false);
        return;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        addLog('-> TIMEOUT ABORTED (10s)');
        controller.abort();
      }, 10000);

      const response = await fetch(`${API_BASE_URL}/api/profile`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${currentSession.access_token}`,
          'Content-Type': 'application/json'
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      addLog(`-> GET STATUS: ${response.status}`);

      const text = await response.text();
      addLog(`-> GET RESPONSE LENGTH: ${text.length}`);

      if (response.ok) {
        const parsed = JSON.parse(text);
        setName(parsed.name || '');
        setPhone(parsed.phone || '');
        setBloodGroup(parsed.blood_group || '');
        setMedicalNotes(parsed.medical_notes || '');
      }
    } catch (e: any) {
      addLog(`-> GET FAILED: ${e.name} - ${e.message}`);
    } finally {
      setIsLoadingProfile(false);
    }
  };

  const saveProfile = async () => {
    setIsSavingProfile(true);
    addLog('--- SAVE PROFILE START ---');

    try {
      const { data } = await supabase.auth.getSession();
      const currentSession = data.session;
      if (!currentSession?.access_token) {
        addLog('-> FAILED: No active session found');
        Alert.alert('Error', 'No active session found.');
        setIsSavingProfile(false);
        return;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        addLog('-> POST TIMEOUT ABORTED (15s)');
        controller.abort();
      }, 15000);
      console.log('REQUEST URL =', `${API_BASE_URL}/api/profile`);
      const response = await fetch(`${API_BASE_URL}/api/profile`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${currentSession.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name, phone, blood_group: bloodGroup, medical_notes: medicalNotes }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      addLog(`-> POST STATUS: ${response.status}`);

      const responseText = await response.text();

      if (response.ok) {
        Alert.alert('Success', 'Profile updated successfully.');
      } else {
        Alert.alert('Backend Error', responseText || `HTTP ${response.status}`);
      }
    } catch (e: any) {
      addLog(`-> POST FAILED: ${e.name} - ${e.message}`);
      Alert.alert('Save Failed', e.name === 'AbortError' ? 'Request timed out' : e.message || 'Network error');
    } finally {
      setIsSavingProfile(false);
    }
  };

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

        <View style={styles.card}>
          <Text style={{ fontWeight: 'bold', marginBottom: 8 }}>Diagnostic Logs:</Text>
          {debugLogs.map((log, i) => (
            <Text key={i} style={{ fontSize: 10, fontFamily: 'monospace', color: '#333' }}>{log}</Text>
          ))}
          <TouchableOpacity onPress={() => setDebugLogs([])}>
            <Text style={{ color: 'blue', marginTop: 10 }}>Clear Logs</Text>
          </TouchableOpacity>
        </View>

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
          <PrimaryButton title="Log Out" variant="danger" onPress={handleLogout} style={{ marginTop: 16 }} />
        </View>

        {session && (
          <>
            <SectionHeader title="Personal Profile" subtitle="Important details for emergency responders" />
            <View style={styles.card}>
              {isLoadingProfile ? (
                <ActivityIndicator color="#4F46E5" />
              ) : (
                <>
                  <Text style={styles.inputLabel}>Full Name</Text>
                  <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Your full name" />

                  <Text style={styles.inputLabel}>Phone Number</Text>
                  <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="Your phone number" keyboardType="phone-pad" />

                  <Text style={styles.inputLabel}>Blood Group</Text>
                  <TextInput style={styles.input} value={bloodGroup} onChangeText={setBloodGroup} placeholder="E.g. O+, A-, etc." />

                  <Text style={styles.inputLabel}>Emergency / Medical Notes</Text>
                  <TextInput style={[styles.input, { height: 80 }]} value={medicalNotes} onChangeText={setMedicalNotes} placeholder="Allergies, medications, etc." multiline />

                  <PrimaryButton title={isSavingProfile ? "Saving..." : "Save Profile"} variant="primary" onPress={saveProfile} disabled={isSavingProfile} />
                </>
              )}
            </View>
          </>
        )}

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
  inputLabel: { fontSize: 14, fontWeight: '700', color: '#334155', marginBottom: 6 },
  input: { backgroundColor: '#F8FAFC', padding: 14, borderRadius: 10, color: '#1E293B', borderWidth: 1, borderColor: '#E2E8F0', fontSize: 15, marginBottom: 16 }
});
