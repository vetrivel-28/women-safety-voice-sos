import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFamily } from '../context/FamilyContext';
import { supabase } from '../lib/supabaseClient';
import { useNavigation } from '@react-navigation/native';
import { PrimaryButton } from '../components/PrimaryButton';

export default function FamilySettingsScreen() {
  const { family, regeneratePin, leaveFamily } = useFamily();
  const navigation = useNavigation();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session) {
         setCurrentUserId(data.session.user.id);
      }
    });
  }, []);

  const isHost = family?.host_user_id === currentUserId;

  const handleRegeneratePin = async () => {
    Alert.alert(
      "Regenerate PIN",
      "This will invalidate the current PIN. Any pending requests will remain, but new members must use the new PIN. Are you sure?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Regenerate",
          onPress: async () => {
            setLoadingAction('regenerate');
            setError(null);
            try {
              await regeneratePin();
            } catch (e: any) {
              if (e.response && e.response.data && e.response.data.detail) {
                setError(e.response.data.detail);
              } else {
                setError(e.message || "Failed to regenerate PIN");
              }
            } finally {
              setLoadingAction(null);
            }
          }
        }
      ]
    );
  };

  const handleLeave = async () => {
    Alert.alert(
      "Leave Family",
      "Are you sure you want to leave this family? You will lose access to the shared map and SOS alerts.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Leave",
          style: "destructive",
          onPress: async () => {
            setLoadingAction('leave');
            setError(null);
            try {
              await leaveFamily();
              navigation.navigate('Home' as never);
            } catch (e: any) {
              if (e.response && e.response.data && e.response.data.detail) {
                setError(e.response.data.detail);
              } else {
                setError(e.message || "Failed to leave family");
              }
            } finally {
              setLoadingAction(null);
            }
          }
        }
      ]
    );
  };

  if (!family) return null;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.title}>Family Settings</Text>

        {error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.label}>Family Name</Text>
          <Text style={styles.value}>{family.family_name}</Text>
        </View>

        {isHost && (
          <View style={styles.card}>
            <Text style={styles.label}>Join PIN</Text>
            <Text style={styles.pinValue}>{family.family_pin}</Text>
            <Text style={styles.hint}>Share this 6-digit PIN with members you want to invite.</Text>
            <TouchableOpacity 
              style={[styles.btn, loadingAction === 'regenerate' && {opacity: 0.7}]} 
              onPress={handleRegeneratePin}
              disabled={loadingAction === 'regenerate'}
            >
              <Text style={styles.btnText}>
                {loadingAction === 'regenerate' ? 'Regenerating...' : 'Regenerate PIN'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{marginTop: 24}}>
          {isHost ? (
             <View style={styles.hostWarning}>
               <Text style={styles.hostWarningText}>As the host, you cannot leave the family. You must delete the family or transfer host privileges (coming soon) to leave.</Text>
             </View>
          ) : (
            <TouchableOpacity 
              style={[styles.dangerBtn, loadingAction === 'leave' && {opacity: 0.7}]} 
              onPress={handleLeave}
              disabled={loadingAction === 'leave'}
            >
              <Text style={styles.dangerBtnText}>
                 {loadingAction === 'leave' ? 'Leaving...' : 'Leave Family'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FAFAF9' },
  container: { padding: 24 },
  header: { marginBottom: 16, marginLeft: -8 },
  backButton: { padding: 8 },
  backText: { fontSize: 16, color: '#4F46E5', fontWeight: '500' },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 24, color: '#1E293B' },
  errorBanner: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  errorText: { color: '#DC2626', fontSize: 14, textAlign: 'center', fontWeight: '500' },
  card: { backgroundColor: 'white', padding: 16, borderRadius: 12, marginBottom: 16, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  label: { fontSize: 14, color: '#64748B', marginBottom: 4 },
  value: { fontSize: 18, fontWeight: '600', color: '#1E293B' },
  pinValue: { fontSize: 32, letterSpacing: 8, fontWeight: 'bold', marginVertical: 12, textAlign: 'center', color: '#4F46E5' },
  hint: { fontSize: 13, color: '#94A3B8', textAlign: 'center', marginBottom: 16 },
  btn: { backgroundColor: '#EEF2FF', padding: 12, borderRadius: 8, alignItems: 'center' },
  btnText: { color: '#4F46E5', fontWeight: '600' },
  dangerBtn: { backgroundColor: '#FEF2F2', padding: 16, borderRadius: 12, alignItems: 'center' },
  dangerBtnText: { color: '#DC2626', fontWeight: 'bold', fontSize: 16 },
  hostWarning: { backgroundColor: '#F1F5F9', padding: 16, borderRadius: 12 },
  hostWarningText: { color: '#475569', fontSize: 14, textAlign: 'center', lineHeight: 20 }
});
