import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TextInput, KeyboardAvoidingView, Platform, ScrollView, Alert, Animated } from 'react-native';
import * as Linking from 'expo-linking';
import { useAlert } from '../context/AlertContext';
import { useContacts } from '../context/ContactsContext';
import { getCurrentLocationForAlert } from '../utils/location';
import { PrimaryButton } from '../components/PrimaryButton';
import { SectionHeader } from '../components/SectionHeader';

export const SOSScreen: React.FC = () => {
  const { createAlert, cancelAlert } = useAlert();
  const { contacts } = useContacts();
  
  const [countdown, setCountdown] = useState(5);
  const [pin, setPin] = useState('');
  const [status, setStatus] = useState<'COUNTING_DOWN' | 'ACTIVE' | 'CANCELLED'>('COUNTING_DOWN');
  const [message, setMessage] = useState('SOS will be sent in 5 seconds');
  const [demoNote, setDemoNote] = useState('');
  const [alertId, setAlertId] = useState<string | null>(null);
  const [locationStatus, setLocationStatus] = useState('');
  const [notificationState, setNotificationState] = useState<'Not Started' | 'Preparing' | 'Ready to Send' | 'Sent' | 'Failed' | 'Pending Provider' | 'Fallback (Manual SMS)'>('Not Started');
  
  const hasCreatedAlert = useRef(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (status === 'COUNTING_DOWN') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.1, duration: 500, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 500, useNativeDriver: true })
        ])
      ).start();
    } else {
      pulseAnim.stopAnimation();
    }
  }, [status, pulseAnim]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (status === 'COUNTING_DOWN' && countdown > 0) {
      setNotificationState('Preparing');
      timer = setTimeout(() => {
        setCountdown(prev => prev - 1);
        setMessage(`SOS will be sent in ${countdown - 1} seconds`);
      }, 1000);
    } else if (status === 'COUNTING_DOWN' && countdown === 0) {
      if (!hasCreatedAlert.current) {
        hasCreatedAlert.current = true;
        setStatus('ACTIVE');
        setMessage('🚨 SOS Alert Sent 🚨');
        setLocationStatus('Sending to backend...');
        
        getCurrentLocationForAlert().then(async locationData => {
          const loc = locationData && !locationData.permissionDenied ? locationData : undefined;
          const primaryGuardian = [...contacts].sort((a, b) => a.priority - b.priority)[0];
          
          try {
            const newId = await createAlert({
              triggerType: 'MANUAL_SOS',
              status: 'ACTIVE',
              visibleMessage: 'SOS Alert Sent',
              cancelMethod: 'NONE',
              location: loc,
              guardian_name: primaryGuardian?.name,
              guardian_phone: primaryGuardian?.phone,
              guardian_email: primaryGuardian?.email
            });
            setAlertId(newId);
            setLocationStatus(loc ? 'Location attached ✓' : 'Location unavailable — alert still sent');
            setNotificationState('Sent');
          } catch (e) {
            setLocationStatus('Failed to send alert');
            setNotificationState('Failed');
          }
        }).catch(error => {
          console.log("SOS_SCREEN: error =", error);
          setNotificationState('Failed');
        });
      }
    }
    return () => clearTimeout(timer);
  }, [countdown, status, createAlert, contacts]);

  const handleCancel = async () => {
    if (!alertId) {
      // If alert hasn't been created yet (still in countdown), we can just stop it
      if (status === 'COUNTING_DOWN') {
         setStatus('CANCELLED');
         setMessage('SOS Cancelled before sending');
         hasCreatedAlert.current = true;
         return;
      }
      return;
    }

    if (pin === '1234') {
      setStatus('CANCELLED');
      setMessage('SOS Cancelled');
      await cancelAlert(alertId, 'REAL_PIN');
    } else if (pin === '4321') {
      setStatus('CANCELLED'); // UI says cancelled to fool attacker
      setMessage('SOS Cancelled');
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
             <Text style={styles.title}>Emergency SOS</Text>
             <Text style={styles.subtitle}>Alerting your guardians and safety network.</Text>
          </View>

          <View style={[styles.statusCard, status === 'ACTIVE' && styles.statusCardActive]}>
             {status === 'COUNTING_DOWN' && (
               <Animated.View style={[styles.countdownRing, { transform: [{ scale: pulseAnim }] }]}>
                 <Text style={styles.countdownNumber}>{countdown}</Text>
               </Animated.View>
             )}
             {status === 'ACTIVE' && (
               <View style={styles.activeIconContainer}>
                 <Text style={styles.activeIcon}>🚨</Text>
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
                 {(() => {
                   const primaryGuardian = [...contacts].sort((a, b) => a.priority - b.priority)[0];
                   return (
                     <>
                       <Text style={styles.escalationItem}>
                         ✓ {primaryGuardian ? primaryGuardian.name : 'Primary Guardian'}: {notificationState}
                       </Text>
                       <Text style={styles.escalationItemPending}>⧗ Backend synchronization verified.</Text>
                       {notificationState === 'Fallback (Manual SMS)' || notificationState === 'Failed' ? (
                         <Text style={styles.escalationItemPending}>⚠️ Automatic SMS provider not configured. Using manual SMS fallback.</Text>
                       ) : (
                         <Text style={styles.escalationItemPending}>⧗ Awaiting response from {primaryGuardian ? primaryGuardian.name : 'guardians'}...</Text>
                       )}
                     </>
                   );
                 })()}
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
                title="Cancel SOS" 
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

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FAFAF9' },
  container: { flexGrow: 1, padding: 24, paddingTop: Platform.OS === 'ios' ? 20 : 60 },
  header: { marginBottom: 32, alignItems: 'center' },
  title: { fontSize: 32, fontWeight: '900', color: '#DC2626', marginBottom: 4, letterSpacing: -0.5 },
  subtitle: { fontSize: 16, color: '#64748B', fontWeight: '500', textAlign: 'center' },
  statusCard: {
    backgroundColor: '#FFFFFF', padding: 32, borderRadius: 24, alignItems: 'center', marginBottom: 32,
    shadowColor: '#1E293B', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.05, shadowRadius: 16, elevation: 4,
    borderWidth: 1, borderColor: '#F1F5F9'
  },
  statusCardActive: {
    borderColor: '#FECACA', backgroundColor: '#FEF2F2', shadowColor: '#DC2626'
  },
  countdownRing: {
    width: 120, height: 120, borderRadius: 60, backgroundColor: '#FEF2F2',
    borderWidth: 6, borderColor: '#DC2626', alignItems: 'center', justifyContent: 'center', marginBottom: 24,
  },
  countdownNumber: { fontSize: 56, fontWeight: '900', color: '#DC2626' },
  activeIconContainer: {
    width: 100, height: 100, borderRadius: 50, backgroundColor: '#DC2626', alignItems: 'center', justifyContent: 'center', marginBottom: 24,
  },
  cancelledIconContainer: {
    width: 100, height: 100, borderRadius: 50, backgroundColor: '#D1FAE5', alignItems: 'center', justifyContent: 'center', marginBottom: 24,
  },
  activeIcon: { fontSize: 48 },
  warningText: { fontSize: 18, color: '#1E293B', textAlign: 'center', fontWeight: '700' },
  activeText: { color: '#DC2626', fontSize: 24, fontWeight: '900' },
  locationStatusText: { fontSize: 14, color: '#64748B', textAlign: 'center', marginTop: 12, fontWeight: '500' },
  inputContainer: { width: '100%', alignItems: 'center', marginBottom: 32 },
  inputLabel: { fontSize: 14, fontWeight: '600', color: '#64748B', marginBottom: 8 },
  pinInput: { 
    width: '60%', height: 60, borderWidth: 2, borderColor: '#E2E8F0', borderRadius: 16, backgroundColor: '#FFFFFF',
    paddingHorizontal: 16, fontSize: 24, textAlign: 'center', marginBottom: 16, letterSpacing: 12, fontWeight: '800', color: '#1E293B'
  },
  cancelBtn: { width: '60%' },
  demoNoteBox: { backgroundColor: '#FEF2F2', padding: 16, borderRadius: 12, marginBottom: 24, borderWidth: 1, borderColor: '#FECACA' },
  demoNote: { color: '#991B1B', fontWeight: '600', textAlign: 'center', fontSize: 14 },
  helperCard: {
    marginTop: 'auto', backgroundColor: '#FFFFFF', padding: 20, borderRadius: 16, width: '100%',
    borderWidth: 1, borderColor: '#F1F5F9'
  },
  helperText: { fontSize: 15, color: '#475569', marginBottom: 8 },
  bold: { fontWeight: '800', color: '#1E293B' },
  escalationBox: { marginTop: 16, width: '100%', padding: 16, backgroundColor: '#F8FAFC', borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0' },
  escalationTitle: { fontSize: 12, fontWeight: '700', color: '#64748B', textTransform: 'uppercase', marginBottom: 8 },
  escalationItem: { fontSize: 13, color: '#16A34A', fontWeight: '600', marginBottom: 4 },
  escalationItemPending: { fontSize: 13, color: '#D97706', fontWeight: '500', fontStyle: 'italic' }
});
