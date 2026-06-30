import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Platform, Alert, Switch, TouchableOpacity, TextInput, KeyboardAvoidingView, Linking, ActivityIndicator } from 'react-native';
import { supabase } from '../lib/supabaseClient';
import { PrimaryButton } from '../components/PrimaryButton';
import { SectionHeader } from '../components/SectionHeader';
import { useContacts } from '../context/ContactsContext';


import { API_BASE_URL, apiClient } from '../api/client';
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
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const addLog = (msg: string) => {
    const time = new Date().toLocaleTimeString();
    setDebugLogs(prev => [...prev, `[${time}] ${msg}`]);
  };

  const { contacts, getPrimaryContact } = useContacts();
  const [devMode, setDevMode] = useState(false);

  const [originalProfile, setOriginalProfile] = useState<any>(null);

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
      const response = await apiClient.get('/api/profile');
      addLog(`-> GET STATUS: ${response.status}`);

      const parsed = response.data;
      if (parsed) {
        setOriginalProfile(parsed);
        setName(parsed.name || '');
        setPhone(parsed.phone || '');
        setBloodGroup(parsed.blood_group || '');
        setMedicalNotes(parsed.medical_notes || '');
      }
    } catch (e: any) {
      addLog(`-> GET FAILED: ${e.message}`);
      // Do not clear the existing profile state on failure
      Alert.alert("Notice", "Could not load profile. Showing last known data.");
    } finally {
      setIsLoadingProfile(false);
    }
  };

  const saveProfile = async () => {
    setIsSavingProfile(true);
    addLog('--- SAVE PROFILE START ---');

    try {
      // 1. Health check first
      try {
        await apiClient.get('/health');
      } catch (healthError: any) {
        addLog(`-> HEALTH CHECK FAILED: ${healthError.message}`);
        Alert.alert(
          'Cannot reach backend.',
          healthError.customMessage || `Backend URL: ${API_BASE_URL}\n\nPossible causes:\n• backend not running\n• phone not on same Wi-Fi\n• firewall\n• invalid backend URL`
        );
        setIsSavingProfile(false);
        return;
      }

      // Only send fields that actually changed from the loaded profile
      const changed: any = {};
      if (name !== (originalProfile?.name || '')) changed.name = name;
      if (phone !== (originalProfile?.phone || '')) changed.phone = phone;
      if (bloodGroup !== (originalProfile?.blood_group || '')) changed.blood_group = bloodGroup;
      if (medicalNotes !== (originalProfile?.medical_notes || '')) changed.medical_notes = medicalNotes;

      if (Object.keys(changed).length === 0) {
         Alert.alert('Notice', 'No changes to save.');
         setIsSavingProfile(false);
         return;
      }

      // 2. Perform Save
      const response = await apiClient.patch('/api/profile', changed);
      
      addLog(`-> POST STATUS: ${response.status}`);
      Alert.alert('Success', 'Profile updated successfully.');
      
      // Trust the server response for the new state
      if (response.data) {
        setOriginalProfile(response.data);
        setName(response.data.name || '');
        setPhone(response.data.phone || '');
        setBloodGroup(response.data.blood_group || '');
        setMedicalNotes(response.data.medical_notes || '');
      }
      setIsEditingProfile(false);

    } catch (e: any) {
      addLog(`-> POST FAILED: ${e.message}`);
      Alert.alert('Save Failed', e.customMessage || e.message || 'Network error');
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

  const primaryContact = getPrimaryContact();

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
          <Text style={styles.subtitle}>Preferences, Privacy, and Account.</Text>
        </View>

        <SectionHeader title="Profile" />
        <View style={styles.card}>
          <View style={styles.accountRow}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarText}>{userEmail ? userEmail.charAt(0).toUpperCase() : 'U'}</Text>
            </View>
            <View>
              <Text style={styles.userEmail}>{userEmail || 'Local Guest'}</Text>
              <Text style={styles.userStatus}>Status: Active</Text>
            </View>
          </View>
          <PrimaryButton title="Log Out" variant="danger" onPress={handleLogout} style={{ marginTop: 16 }} />
        </View>

        {session && (
          <>
            <SectionHeader title={isEditingProfile ? "Edit Profile" : "My Profile"} subtitle="Important details for emergency responders" />
            <View style={styles.card}>
              {isLoadingProfile ? (
                <ActivityIndicator color="#4F46E5" />
              ) : isEditingProfile ? (
                <>
                  <Text style={styles.inputLabel}>Full Name</Text>
                  <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Your full name" />

                  <Text style={styles.inputLabel}>Phone Number</Text>
                  <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="Your phone number" keyboardType="phone-pad" />

                  <Text style={styles.inputLabel}>Blood Group</Text>
                  <TextInput style={styles.input} value={bloodGroup} onChangeText={setBloodGroup} placeholder="E.g. O+, A-, etc." />

                  <Text style={styles.inputLabel}>Emergency / Medical Notes</Text>
                  <TextInput style={[styles.input, { height: 80 }]} value={medicalNotes} onChangeText={setMedicalNotes} placeholder="Allergies, medications, etc." multiline />

                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <PrimaryButton title="Cancel" variant="outline" onPress={() => {
                        // Revert to original
                        setName(originalProfile?.name || '');
                        setPhone(originalProfile?.phone || '');
                        setBloodGroup(originalProfile?.blood_group || '');
                        setMedicalNotes(originalProfile?.medical_notes || '');
                        setIsEditingProfile(false);
                      }} />
                    </View>
                    <View style={{ flex: 1, marginLeft: 8 }}>
                      <PrimaryButton title={isSavingProfile ? "Saving..." : "Save Profile"} variant="primary" onPress={saveProfile} disabled={isSavingProfile} />
                    </View>
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.listItem}><Text style={styles.bold}>Name:</Text> {name || 'Not provided'}</Text>
                  <Text style={styles.listItem}><Text style={styles.bold}>Phone:</Text> {phone || 'Not provided'}</Text>
                  <Text style={styles.listItem}><Text style={styles.bold}>Blood Group:</Text> {bloodGroup || 'Not provided'}</Text>
                  <Text style={styles.listItem}><Text style={styles.bold}>Medical Notes:</Text> {medicalNotes || 'None'}</Text>
                  <PrimaryButton title="Edit Profile" variant="primary" onPress={() => setIsEditingProfile(true)} style={{ marginTop: 16 }} />
                </>
              )}
            </View>
          </>
        )}

        <SectionHeader title="Emergency Contacts" />
        <View style={styles.card}>
          <Text style={styles.listItem}><Text style={styles.bold}>Primary Guardian:</Text> {primaryContact ? primaryContact.name : 'None set'}</Text>
          <Text style={styles.listItem}><Text style={styles.bold}>Total Trusted Guardians:</Text> {contacts.length}</Text>
          <Text style={styles.helperText}>Manage contacts in the Trusted Guardians tab.</Text>
        </View>

        <SectionHeader title="Safety Preferences" />
        <View style={styles.card}>
          <Text style={styles.listItem}><Text style={styles.bold}>Real Cancel PIN:</Text> 1234</Text>
          <Text style={styles.listItem}><Text style={styles.bold}>Duress PIN:</Text> 4321</Text>
          <Text style={styles.listItem}><Text style={styles.bold}>SOS Countdown:</Text> 5 Seconds</Text>
          <View style={styles.divider} />
          <View style={styles.toggleRow}>
            <View style={{flex: 1}}>
              <Text style={styles.toggleTitle}>Shake Trigger (Future)</Text>
              <Text style={styles.toggleDesc}>Trigger SOS by shaking device</Text>
            </View>
            <Switch value={false} disabled={true} />
          </View>
          <View style={styles.divider} />
          <View style={styles.toggleRow}>
            <View style={{flex: 1}}>
              <Text style={styles.toggleTitle}>Voice Guard (Future)</Text>
              <Text style={styles.toggleDesc}>Voice activation</Text>
            </View>
            <Switch value={false} disabled={true} />
          </View>
        </View>

        <SectionHeader title="Journey Mode Preferences" />
        <View style={styles.card}>
          <Text style={styles.listItem}><Text style={styles.bold}>Default Duration:</Text> 30 min</Text>
          <Text style={styles.listItem}><Text style={styles.bold}>Default Check-in:</Text> 5 min</Text>
          <Text style={styles.listItem}><Text style={styles.bold}>Deviation Threshold:</Text> 300 meters</Text>
        </View>

        <SectionHeader title="Guardian Notifications" />
        <View style={styles.card}>
          <View style={styles.infoBox}>
             <Text style={styles.infoText}>Automatic SMS/push provider is not configured. Manual message fallback is available for visible SOS.</Text>
          </View>
        </View>


        <SectionHeader title="App Info" />
        <View style={styles.card}>
          <Text style={styles.listItem}><Text style={styles.bold}>Version:</Text> 1.0.0</Text>
          <Text style={styles.listItem}><Text style={styles.bold}>Environment:</Text> Development</Text>
          <Text style={styles.helperText}>SafeHer is designed for personal safety. If you are in immediate danger, always contact local emergency services.</Text>
        </View>
        
        <TouchableOpacity style={styles.devToggle} onPress={() => setDevMode(!devMode)}>
          <Text style={styles.devToggleText}>Toggle Dev Mode</Text>
        </TouchableOpacity>

        {devMode && (
          <View style={styles.devCard}>
            <Text style={styles.devTitle}>Developer Tools</Text>
            <Text style={styles.devText}>Demo pins and mock data active.</Text>
            <Text style={styles.devText}>Backend Sync: Active</Text>
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
  title: { fontSize: 32, fontWeight: '900', color: '#1E293B', marginBottom: 4, letterSpacing: -0.5 },
  subtitle: { fontSize: 16, color: '#64748B', fontWeight: '500' },
  card: {
    backgroundColor: '#FFFFFF', padding: 24, borderRadius: 20, marginBottom: 24,
    shadowColor: '#1E293B', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2,
    borderWidth: 1, borderColor: '#F1F5F9'
  },
  accountRow: { flexDirection: 'row', alignItems: 'center' },
  avatarCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  avatarText: { fontSize: 24, fontWeight: '800', color: '#4F46E5' },
  userEmail: { fontSize: 16, fontWeight: '800', color: '#1E293B', marginBottom: 4 },
  userStatus: { fontSize: 14, color: '#16A34A', fontWeight: '700' },
  listItem: { fontSize: 15, color: '#334155', marginBottom: 12, lineHeight: 22 },
  bold: { fontWeight: '700', color: '#1E293B' },
  inputLabel: { fontSize: 14, fontWeight: '700', color: '#334155', marginBottom: 6 },
  input: { backgroundColor: '#F8FAFC', padding: 14, borderRadius: 10, color: '#1E293B', borderWidth: 1, borderColor: '#E2E8F0', fontSize: 15, marginBottom: 16 },
  helperText: { fontSize: 13, color: '#64748B', lineHeight: 20, marginTop: 8 },
  infoBox: { backgroundColor: '#FFFBEB', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#FEF3C7' },
  infoText: { fontSize: 14, color: '#B45309', fontWeight: '500', lineHeight: 20 },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  toggleTitle: { fontSize: 15, fontWeight: '700', color: '#1E293B', marginBottom: 4 },
  toggleDesc: { fontSize: 13, color: '#64748B', lineHeight: 18 },
  divider: { height: 1, backgroundColor: '#F1F5F9', marginVertical: 16 },
  devToggle: { alignSelf: 'center', marginVertical: 20, padding: 10 },
  devToggleText: { color: '#94A3B8', fontSize: 12, fontWeight: '600', textTransform: 'uppercase' },
  devCard: { backgroundColor: '#F8FAFC', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 40 },
  devTitle: { fontSize: 14, fontWeight: '700', color: '#334155', marginBottom: 8 },
  devText: { fontSize: 12, color: '#64748B', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', marginBottom: 4 }
});
