import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { useContacts } from '../context/ContactsContext';
import { PrimaryButton } from '../components/PrimaryButton';
import { SectionHeader } from '../components/SectionHeader';
import { apiClient } from '../api/client';

export const ContactsScreen: React.FC = () => {
  const { getTopFiveContacts, addContact, deleteContact, setPrimaryContact } = useContacts();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [relationship, setRelationship] = useState('');

  const [linkEmail, setLinkEmail] = useState('');
  const [isLinking, setIsLinking] = useState(false);

  const topFive = getTopFiveContacts();

  const handleAddContact = async () => {
    if (!name.trim() || !phone.trim()) {
      Alert.alert('Validation Error', 'Name and Phone number are required.');
      return;
    }

    addContact({
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim() || undefined,
      relationship: relationship.trim() || 'Emergency Contact',
      priority: topFive.length + 1,
    } as any);

    handleClearForm();
  };

  const [myGuardianCode, setMyGuardianCode] = useState('');
  const [myGuardians, setMyGuardians] = useState<any[]>([]);
  const [watching, setWatching] = useState<any[]>([]);
  const [codeError, setCodeError] = useState(false);
  const [codeLoading, setCodeLoading] = useState(true);

  useEffect(() => {
    fetchGuardianData();
  }, []);

  const fetchGuardianData = async () => {
    setCodeLoading(true);
    setCodeError(false);
    try {
      const codeRes = await apiClient.get('/api/guardians/me/code');
      const wardCode = codeRes.data.ward_code || codeRes.data.code || codeRes.data.guardian_code || '';
      setMyGuardianCode(wardCode);

      const guardiansRes = await apiClient.get('/api/guardians');
      setMyGuardians(guardiansRes.data || []);

      const watchingRes = await apiClient.get('/api/guardians/watching');
      setWatching(watchingRes.data || []);
    } catch (e) {
      console.warn("Failed to fetch guardian data", e);
      setCodeError(true);
    } finally {
      setCodeLoading(false);
    }
  };

  const handleLinkGuardian = async (inputValue: string) => {
    if (!inputValue.trim()) return;
    setIsLinking(true);
    try {
      const { data: { session } } = await import('../lib/supabaseClient').then(m => m.supabase.auth.getSession());
      if (!session) {
         Alert.alert('Error', 'You must be logged in to link a guardian.');
         return;
      }

      let payload: any = {};
      const val = inputValue.trim();
      if (/^[0-9]{6}$/.test(val)) {
        payload = { ward_code: val };
      } else {
        Alert.alert('Validation Error', 'Input must be exactly 6 digits.');
        setIsLinking(false);
        return;
      }

      const response = await apiClient.post('/api/guardians/link', payload);

      if (response.data?.message === "Already linked") {
        Alert.alert('Info', 'Already linked to this guardian.');
      } else {
        Alert.alert('Success', 'Guardian linked successfully!');
      }
      setLinkEmail('');
      fetchGuardianData();
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.detail || e.message);
    } finally {
      setIsLinking(false);
    }
  };

  const handleClearForm = () => {
    setName('');
    setPhone('');
    setEmail('');
    setRelationship('');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Text style={styles.title}>Trusted Guardians</Text>
            <Text style={styles.subtitle}>Manage the trusted guardians who receive your alerts.</Text>
          </View>

          <SectionHeader title="Your Guardians" subtitle="Top 5 contacts will be notified during an SOS." />
          
          <View style={styles.listSection}>
            {topFive.length === 0 ? (
              <View style={styles.emptyContainer}>
                 <Text style={styles.emptyIcon}>👥</Text>
                 <Text style={styles.emptyTitle}>No guardians added yet</Text>
                 <Text style={styles.emptyText}>Add your most trusted contacts below.</Text>
              </View>
            ) : (
              topFive.map(contact => (
                <View key={contact.id} style={styles.contactCard}>
                  <View style={styles.contactHeader}>
                    <View style={styles.nameRow}>
                      <Text style={styles.contactIcon}>👤</Text>
                      <View>
                        <Text style={styles.contactName}>{contact.name}</Text>
                        <Text style={styles.contactRelation}>{contact.relationship}</Text>
                      </View>
                    </View>
                    <View style={styles.badgesRow}>
                      {contact.priority === 1 ? (
                        <View style={styles.primaryBadge}>
                          <Text style={styles.primaryBadgeText}>Primary</Text>
                        </View>
                      ) : (
                        <TouchableOpacity onPress={() => setPrimaryContact(contact.id)} style={styles.makePrimaryBtn}>
                          <Text style={styles.makePrimaryText}>Make Primary</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity onPress={() => deleteContact(contact.id)} style={styles.deleteBtn}>
                        <Text style={styles.deleteIcon}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  
                  <View style={styles.contactFooter}>
                    <Text style={styles.contactPhone}>📞 {contact.phone}</Text>
                    {contact.email && <Text style={styles.contactEmail}>✉️ {contact.email}</Text>}
                  </View>
                </View>
              ))
            )}
          </View>

          <SectionHeader title="Add New Contact" />

          <View style={styles.formCard}>
            <Text style={styles.inputLabel}>Guardian Name *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Jane Doe"
              placeholderTextColor="#94A3B8"
              value={name}
              onChangeText={setName}
            />
            <Text style={styles.inputLabel}>Phone Number *</Text>
            <TextInput
              style={styles.input}
              placeholder="+1 234 567 8900"
              placeholderTextColor="#94A3B8"
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
            />
            <Text style={styles.inputLabel}>Email (Optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="guardian@example.com"
              placeholderTextColor="#94A3B8"
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
            />
            <Text style={styles.inputLabel}>Relationship</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Sister, Friend"
              placeholderTextColor="#94A3B8"
              value={relationship}
              onChangeText={setRelationship}
            />

            <View style={styles.buttonRow}>
              <PrimaryButton style={styles.addBtn} title="Save Guardian" onPress={handleAddContact} variant="primary" />
              <PrimaryButton style={styles.clearBtn} title="Clear" onPress={handleClearForm} variant="secondary" />
            </View>
          </View>

          <SectionHeader title="My Ward Code" subtitle="Share this 6-digit code with your guardian so they can monitor you." />
          <View style={styles.formCard}>
            {codeLoading ? (
              <Text style={[styles.codeText, { fontSize: 16, color: '#94A3B8' }]}>Loading ward code...</Text>
            ) : codeError ? (
              <View style={{ alignItems: 'center' }}>
                <Text style={{ color: '#EF4444', marginBottom: 8, fontSize: 14 }}>Could not load ward code.</Text>
                <PrimaryButton title="Retry" onPress={fetchGuardianData} variant="outline" style={{ width: 120 }} />
              </View>
            ) : myGuardianCode ? (
              <Text style={styles.codeText}>
                {myGuardianCode.slice(0, 3)} {myGuardianCode.slice(3)}
              </Text>
            ) : (
              <View style={{ alignItems: 'center' }}>
                <Text style={{ color: '#EF4444', marginBottom: 8, fontSize: 14 }}>Ward code not available.</Text>
                <PrimaryButton title="Retry" onPress={fetchGuardianData} variant="outline" style={{ width: 120 }} />
              </View>
            )}
          </View>

          <SectionHeader title="My Guardians" subtitle="App users who are monitoring you via your ward code." />
          <View style={styles.formCard}>
            <View style={{ marginTop: 0 }}>
              {myGuardians.length === 0 ? (
                <Text style={styles.note}>No guardians linked yet. Share your ward code above.</Text>
              ) : (
                myGuardians.map(g => (
                  <View key={g.id} style={styles.linkedCard}>
                    <Text style={styles.contactName}>{g.name}</Text>
                    <Text style={styles.contactEmail}>{g.email}</Text>
                    <Text style={styles.statusText}>Status: {g.status}</Text>
                  </View>
                ))
              )}
            </View>
          </View>

          <SectionHeader title="Add a Ward" subtitle="Enter a ward's 6-digit code to start monitoring them." />
          <View style={styles.formCard}>
            <Text style={styles.inputLabel}>Ward Code *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 123456"
              placeholderTextColor="#94A3B8"
              keyboardType="numeric"
              maxLength={6}
              autoCapitalize="none"
              value={linkEmail}
              onChangeText={setLinkEmail}
            />
            <Text style={{ fontSize: 12, color: '#94A3B8', marginBottom: 12, marginLeft: 4 }}>
              Ask the person you want to monitor to share their ward code with you.
            </Text>
            <PrimaryButton
              title={isLinking ? "Linking..." : "Start Monitoring Ward"}
              onPress={() => handleLinkGuardian(linkEmail)}
              variant="primary"
            />
          </View>

          <SectionHeader title="My Wards" subtitle="People you are currently monitoring." />
          <View style={[styles.formCard, { marginBottom: 40 }]}>
            {watching.length === 0 ? (
               <Text style={styles.note}>No wards linked yet. Add a ward above using their 6-digit code.</Text>
            ) : (
               watching.map(w => (
                 <View key={w.id} style={styles.linkedCard}>
                   <Text style={styles.contactName}>{w.name}</Text>
                   <Text style={styles.contactEmail}>{w.email}</Text>
                   <Text style={styles.statusText}>Status: {w.status}</Text>
                 </View>
               ))
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FAFAF9' },
  container: { flexGrow: 1, padding: 24, paddingTop: Platform.OS === 'ios' ? 20 : 60 },
  header: { marginBottom: 16 },
  title: { fontSize: 32, fontWeight: '900', color: '#1E293B', marginBottom: 4, letterSpacing: -0.5 },
  subtitle: { fontSize: 16, color: '#64748B', fontWeight: '500' },
  listSection: { marginBottom: 24 },
  emptyContainer: {
    backgroundColor: '#FFFFFF', padding: 32, borderRadius: 20, alignItems: 'center',
    borderWidth: 1, borderColor: '#F1F5F9', borderStyle: 'dashed'
  },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#1E293B', marginBottom: 4 },
  emptyText: { fontSize: 14, color: '#64748B' },
  contactCard: {
    backgroundColor: '#FFFFFF', padding: 16, borderRadius: 16, marginBottom: 12,
    shadowColor: '#1E293B', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2,
    borderWidth: 1, borderColor: '#F1F5F9'
  },
  contactHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  nameRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12 },
  contactIcon: { fontSize: 24, backgroundColor: '#F8FAFC', padding: 8, borderRadius: 20, overflow: 'hidden' },
  contactName: { fontSize: 18, fontWeight: '800', color: '#1E293B' },
  contactRelation: { fontSize: 13, color: '#64748B', fontWeight: '500' },
  badgesRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  primaryBadge: { backgroundColor: '#FEF3C7', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  primaryBadgeText: { color: '#B45309', fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  makePrimaryBtn: { backgroundColor: '#F1F5F9', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  makePrimaryText: { color: '#475569', fontSize: 10, fontWeight: '700' },
  deleteBtn: { padding: 4, backgroundColor: '#FEE2E2', borderRadius: 12, width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  deleteIcon: { color: '#DC2626', fontWeight: '800', fontSize: 12 },
  contactFooter: { borderTopWidth: 1, borderTopColor: '#F8FAFC', paddingTop: 12 },
  contactPhone: { color: '#4F46E5', fontSize: 14, fontWeight: '700' },
  contactEmail: { color: '#64748B', fontSize: 12, fontWeight: '500', marginTop: 4 },
  formCard: {
    backgroundColor: '#FFFFFF', padding: 24, borderRadius: 24, marginBottom: 24,
    shadowColor: '#1E293B', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.05, shadowRadius: 16, elevation: 4,
    borderWidth: 1, borderColor: '#F1F5F9'
  },
  inputLabel: { fontSize: 13, fontWeight: '700', color: '#334155', marginBottom: 8, marginLeft: 4 },
  input: {
    borderWidth: 1, borderColor: 'transparent', backgroundColor: '#F1F5F9', borderRadius: 12, padding: 16, marginBottom: 16, fontSize: 16, color: '#1E293B'
  },
  buttonRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  addBtn: { flex: 2, marginBottom: 0 },
  clearBtn: { flex: 1, marginBottom: 0 },
  infoBox: { backgroundColor: '#F8FAFC', padding: 12, borderRadius: 8, marginTop: 16 },
  note: { fontSize: 13, color: '#64748B', fontStyle: 'italic', textAlign: 'center' },
  codeText: { fontSize: 24, fontWeight: '800', color: '#4F46E5', textAlign: 'center', letterSpacing: 2 },
  linkedCard: { backgroundColor: '#F8FAFC', padding: 12, borderRadius: 8, marginBottom: 8, borderWidth: 1, borderColor: '#E2E8F0' },
  statusText: { fontSize: 12, color: '#10B981', fontWeight: '700', marginTop: 4, textTransform: 'uppercase' },
});
