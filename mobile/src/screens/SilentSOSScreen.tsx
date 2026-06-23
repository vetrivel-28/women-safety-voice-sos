import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TextInput, KeyboardAvoidingView, Platform, ScrollView, Alert } from 'react-native';
import { useAlert } from '../context/AlertContext';
import { useContacts } from '../context/ContactsContext';
import { getCurrentLocationForAlert } from '../utils/location';
import { PrimaryButton } from '../components/PrimaryButton';
import { SectionHeader } from '../components/SectionHeader';

export const SilentSOSScreen: React.FC = () => {
  const { createAlert, cancelAlert } = useAlert();
  const { contacts } = useContacts();
  
  const [countdown, setCountdown] = useState(5);
  const [pin, setPin] = useState('');
  const [status, setStatus] = useState<'COUNTING_DOWN' | 'ACTIVE' | 'CANCELLED'>('COUNTING_DOWN');
  const [message, setMessage] = useState('Silent SOS activates in 5 seconds');
  const [demoNote, setDemoNote] = useState('');
  const [alertId, setAlertId] = useState<string | null>(null);
  const [locationStatus, setLocationStatus] = useState('');
  
  const hasCreatedAlert = useRef(false);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (status === 'COUNTING_DOWN' && countdown > 0) {
      timer = setTimeout(() => {
        setCountdown(prev => prev - 1);
        setMessage(`Silent SOS activates in ${countdown - 1} seconds`);
      }, 1000);
    } else if (status === 'COUNTING_DOWN' && countdown === 0) {
      if (!hasCreatedAlert.current) {
        hasCreatedAlert.current = true;
        setStatus('ACTIVE');
        setMessage('System Active');
        setLocationStatus('Getting your location...');
        
        getCurrentLocationForAlert().then(locationData => {
          const primaryGuardian = [...contacts].sort((a, b) => a.priority - b.priority)[0];
          if (locationData && !locationData.permissionDenied) {
            const newId = createAlert({
              triggerType: 'SILENT_SOS',
              status: 'ACTIVE',
              visibleMessage: 'Silent SOS Alert Sent',
              cancelMethod: 'NONE',
              location: locationData,
              guardian_name: primaryGuardian?.name,
              guardian_phone: primaryGuardian?.phone,
              guardian_email: primaryGuardian?.email
            });
            setAlertId(newId);
            setLocationStatus('Location attached ✓');
          } else {
            const newId = createAlert({
              triggerType: 'SILENT_SOS',
              status: 'ACTIVE',
              visibleMessage: 'Silent SOS Alert Sent',
              cancelMethod: 'NONE',
              location: locationData || undefined,
              guardian_name: primaryGuardian?.name,
              guardian_phone: primaryGuardian?.phone,
              guardian_email: primaryGuardian?.email
            });
            setAlertId(newId);
            setLocationStatus('Location unavailable — alert still sent');
          }
        }).catch(error => {
          console.log("SILENT_SOS_SCREEN: error =", error);
        });
      }
    }
    return () => clearTimeout(timer);
  }, [countdown, status, createAlert]);

  const handleCancel = async () => {
    if (!alertId) {
      if (status === 'COUNTING_DOWN') {
         setStatus('CANCELLED');
         setMessage('Silent SOS Cancelled before sending');
         hasCreatedAlert.current = true;
         return;
      }
      return;
    }

    if (pin === '1234') {
      setStatus('CANCELLED');
      setMessage('System Deactivated');
      await cancelAlert(alertId, 'REAL_PIN');
    } else if (pin === '4321') {
      setStatus('CANCELLED');
      setMessage('System Deactivated');
      setDemoNote('A silent duress alert was saved securely.');
      await cancelAlert(alertId, 'DURESS_PIN');
    } else {
      Alert.alert('Invalid PIN', 'The PIN you entered is incorrect.');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.container}>
          
          <View style={styles.header}>
             <Text style={styles.title}>Silent SOS</Text>
             <Text style={styles.subtitle}>Discreetly alerting your guardians.</Text>
          </View>

          <View style={[styles.statusCard, status === 'ACTIVE' && styles.statusCardActive]}>
             {status === 'COUNTING_DOWN' && (
               <View style={styles.countdownRing}>
                 <Text style={styles.countdownNumber}>{countdown}</Text>
               </View>
             )}
             {status === 'ACTIVE' && (
               <View style={styles.activeIconContainer}>
                 <Text style={styles.activeIcon}>🤫</Text>
               </View>
             )}
             {status === 'CANCELLED' && (
               <View style={styles.cancelledIconContainer}>
                 <Text style={styles.activeIcon}>✅</Text>
               </View>
             )}
             
             <Text style={[styles.warningText, status === 'ACTIVE' && styles.activeText]}>
               {message}
             </Text>

             {locationStatus !== '' && (
               <Text style={styles.locationStatusText}>{locationStatus}</Text>
             )}

             {status === 'ACTIVE' && (
               <View style={styles.escalationBox}>
                 <Text style={styles.escalationTitle}>Notification Timeline</Text>
                 <Text style={styles.escalationItem}>✓ Primary Guardians notified silently</Text>
                 <Text style={styles.escalationItemPending}>⧗ Escalating to secondary contacts...</Text>
               </View>
             )}
          </View>

          {status === 'COUNTING_DOWN' && (
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Enter PIN to cancel</Text>
              <TextInput
                style={styles.pinInput}
                placeholder="••••"
                placeholderTextColor="#94A3B8"
                keyboardType="numeric"
                secureTextEntry
                value={pin}
                onChangeText={setPin}
                maxLength={4}
              />
              <PrimaryButton 
                title="Cancel" 
                variant="dark" 
                onPress={handleCancel} 
                style={styles.cancelBtn}
              />
            </View>
          )}

          {demoNote !== '' && (
            <View style={styles.demoNoteBox}>
               <Text style={styles.demoNote}>{demoNote}</Text>
            </View>
          )}

          <View style={styles.helperCard}>
            <SectionHeader title="Demo Pins" />
            <Text style={styles.helperText}>Real Cancel PIN: <Text style={styles.bold}>1234</Text></Text>
            <Text style={styles.helperText}>Duress PIN: <Text style={styles.bold}>4321</Text></Text>
          </View>
          
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FAFAF9' },
  container: { flexGrow: 1, padding: 24, paddingTop: Platform.OS === 'ios' ? 20 : 60 },
  header: { marginBottom: 32, alignItems: 'center' },
  title: { fontSize: 32, fontWeight: '900', color: '#1E293B', marginBottom: 4, letterSpacing: -0.5 },
  subtitle: { fontSize: 16, color: '#64748B', fontWeight: '500', textAlign: 'center' },
  statusCard: {
    backgroundColor: '#FFFFFF', padding: 32, borderRadius: 24, alignItems: 'center', marginBottom: 32,
    shadowColor: '#1E293B', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.05, shadowRadius: 16, elevation: 4,
    borderWidth: 1, borderColor: '#F1F5F9'
  },
  statusCardActive: {
    borderColor: '#E2E8F0', backgroundColor: '#F8FAFC', shadowColor: '#94A3B8'
  },
  countdownRing: {
    width: 120, height: 120, borderRadius: 60, backgroundColor: '#F1F5F9',
    borderWidth: 6, borderColor: '#CBD5E1', alignItems: 'center', justifyContent: 'center', marginBottom: 24,
  },
  countdownNumber: { fontSize: 56, fontWeight: '900', color: '#64748B' },
  activeIconContainer: {
    width: 100, height: 100, borderRadius: 50, backgroundColor: '#1E293B', alignItems: 'center', justifyContent: 'center', marginBottom: 24,
  },
  cancelledIconContainer: {
    width: 100, height: 100, borderRadius: 50, backgroundColor: '#D1FAE5', alignItems: 'center', justifyContent: 'center', marginBottom: 24,
  },
  activeIcon: { fontSize: 48 },
  warningText: { fontSize: 18, color: '#1E293B', textAlign: 'center', fontWeight: '700' },
  activeText: { color: '#0F172A', fontSize: 24, fontWeight: '900' },
  locationStatusText: { fontSize: 14, color: '#64748B', textAlign: 'center', marginTop: 12, fontWeight: '500' },
  inputContainer: { width: '100%', alignItems: 'center', marginBottom: 32 },
  inputLabel: { fontSize: 14, fontWeight: '600', color: '#64748B', marginBottom: 8 },
  pinInput: { 
    width: '60%', height: 60, borderWidth: 2, borderColor: '#E2E8F0', borderRadius: 16, backgroundColor: '#FFFFFF',
    paddingHorizontal: 16, fontSize: 24, textAlign: 'center', marginBottom: 16, letterSpacing: 12, fontWeight: '800', color: '#1E293B'
  },
  cancelBtn: { width: '60%' },
  demoNoteBox: { backgroundColor: '#F8FAFC', padding: 16, borderRadius: 12, marginBottom: 24, borderWidth: 1, borderColor: '#E2E8F0' },
  demoNote: { color: '#475569', fontWeight: '600', textAlign: 'center', fontSize: 14 },
  helperCard: {
    marginTop: 'auto', backgroundColor: '#FFFFFF', padding: 20, borderRadius: 16, width: '100%',
    borderWidth: 1, borderColor: '#F1F5F9'
  },
  helperText: { fontSize: 15, color: '#475569', marginBottom: 8 },
  bold: { fontWeight: '800', color: '#1E293B' },
  escalationBox: { marginTop: 16, width: '100%', padding: 16, backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0' },
  escalationTitle: { fontSize: 12, fontWeight: '700', color: '#64748B', textTransform: 'uppercase', marginBottom: 8 },
  escalationItem: { fontSize: 13, color: '#16A34A', fontWeight: '600', marginBottom: 4 },
  escalationItemPending: { fontSize: 13, color: '#D97706', fontWeight: '500', fontStyle: 'italic' }
});
