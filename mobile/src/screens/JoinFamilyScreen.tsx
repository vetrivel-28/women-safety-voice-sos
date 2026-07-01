import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { PrimaryButton } from '../components/PrimaryButton';
import { useFamily } from '../context/FamilyContext';

export default function JoinFamilyScreen() {
  const navigation = useNavigation();
  const { joinFamily, family, myPendingRequest, pendingFamilyName, loading: contextLoading } = useFamily();
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pre-check: If already in a family, we shouldn't be here.
  useEffect(() => {
    if (family) {
      navigation.navigate('FamilyDashboard' as never);
    }
  }, [family, navigation]);

  const handleJoin = async () => {
    if (pin.length !== 6) {
      setError('Please enter a 6-digit PIN');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await joinFamily(pin);
      // joinFamily calls fetchDashboard; myPendingRequest will update to show pending state
    } catch (e: any) {
      const detail = e.response?.data?.detail || e.message || '';
      if (detail === 'Join request already pending') {
        // Friendly message — not an error, just refresh state
        await import('../context/FamilyContext').then(() => {});
        // The context refresh will set myPendingRequest so the UI transitions automatically
        setError('Your join request is already pending approval. Waiting for the host to approve.');
      } else if (detail === 'You are already in an active family') {
        setError('You are already a member of a family. Leave your current family first.');
      } else {
        setError(detail || 'Failed to join family. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (contextLoading && !myPendingRequest) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.center}>
           <Text style={styles.subtitle}>Checking status...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (myPendingRequest) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.center}>
          <Text style={styles.title}>Request Sent</Text>
          <Text style={styles.subtitle}>
            Waiting for host approval to join "{pendingFamilyName || 'the family'}".
          </Text>
          <Text style={styles.hint}>
            The host has been notified. You'll gain access once they approve your request.
          </Text>
          <TouchableOpacity onPress={() => navigation.navigate('Home' as never)} style={styles.homeBtn}>
             <Text style={styles.homeBtnText}>Back to Home</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          <Text style={styles.title}>Join a Family</Text>
          <Text style={styles.subtitle}>Enter the 6-digit PIN provided by the family host.</Text>
          
          {error && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}
          
          <TextInput
            style={[styles.input, error ? styles.inputError : null]}
            placeholder="000000"
            keyboardType="number-pad"
            maxLength={6}
            value={pin}
            onChangeText={(text) => {
              setPin(text);
              if (error) setError(null);
            }}
            autoFocus
            editable={!loading}
          />
          
          <PrimaryButton 
            title={loading ? "Sending Request..." : "Join"} 
            onPress={handleJoin}
            disabled={loading || pin.length !== 6}
            style={{ width: '100%' }}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FAFAF9' },
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  header: { paddingHorizontal: 16, paddingTop: 16 },
  backButton: { padding: 8 },
  backText: { fontSize: 16, color: '#4F46E5', fontWeight: '500' },
  content: { padding: 24, flex: 1, justifyContent: 'center', marginTop: -60 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 8, textAlign: 'center', color: '#1E293B' },
  subtitle: { fontSize: 16, color: '#64748B', textAlign: 'center', marginBottom: 24 },
  hint: { fontSize: 14, color: '#94A3B8', textAlign: 'center', marginTop: 12, marginBottom: 32 },
  errorBanner: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  errorText: { color: '#DC2626', fontSize: 14, textAlign: 'center', fontWeight: '500' },
  input: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 16,
    fontSize: 32,
    letterSpacing: 8,
    textAlign: 'center',
    marginBottom: 24,
    color: '#1E293B'
  },
  inputError: {
    borderColor: '#EF4444',
  },
  homeBtn: {
    padding: 16,
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    width: '100%',
    alignItems: 'center'
  },
  homeBtnText: {
    color: '#334155',
    fontWeight: '600'
  }
});
