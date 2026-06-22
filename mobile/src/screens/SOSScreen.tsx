import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView, Alert } from 'react-native';
import { useAlert } from '../context/AlertContext';
import { getCurrentLocationForAlert } from '../utils/location';

export const SOSScreen: React.FC = () => {
  const { createAlert } = useAlert();
  
  const [countdown, setCountdown] = useState(5);
  const [pin, setPin] = useState('');
  const [status, setStatus] = useState<'COUNTING_DOWN' | 'ACTIVE' | 'CANCELLED'>('COUNTING_DOWN');
  const [message, setMessage] = useState('SOS will be sent in 5 seconds');
  const [demoNote, setDemoNote] = useState('');
  const [locationStatus, setLocationStatus] = useState('');
  
  const hasCreatedAlert = useRef(false);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (status === 'COUNTING_DOWN' && countdown > 0) {
      timer = setTimeout(() => {
        setCountdown(prev => prev - 1);
        setMessage(`SOS will be sent in ${countdown - 1} seconds`);
      }, 1000);
    } else if (status === 'COUNTING_DOWN' && countdown === 0) {
      if (!hasCreatedAlert.current) {
        hasCreatedAlert.current = true;
        setStatus('ACTIVE');
        setMessage('SOS Alert Sent');
        setLocationStatus('Getting your location...');
        
        getCurrentLocationForAlert().then(locationData => {
          if (locationData && !locationData.permissionDenied) {
            createAlert({
              triggerType: 'MANUAL_SOS',
              status: 'ACTIVE',
              visibleMessage: 'SOS Alert Sent',
              cancelMethod: 'NONE',
              location: locationData
            });
            setLocationStatus('Location attached ✓');
          } else {
            createAlert({
              triggerType: 'MANUAL_SOS',
              status: 'ACTIVE',
              visibleMessage: 'SOS Alert Sent',
              cancelMethod: 'NONE',
              location: locationData || undefined
            });
            setLocationStatus('Location unavailable — alert still sent');
          }
        });
      }
    }
    return () => clearTimeout(timer);
  }, [countdown, status, createAlert]);

  const handleCancel = () => {
    if (hasCreatedAlert.current) return;

    if (pin === '1234') {
      hasCreatedAlert.current = true;
      setStatus('CANCELLED');
      setMessage('SOS cancelled');
      createAlert({
        triggerType: 'MANUAL_SOS',
        status: 'CANCELLED',
        visibleMessage: 'SOS cancelled',
        cancelMethod: 'REAL_PIN'
      });
    } else if (pin === '4321') {
      hasCreatedAlert.current = true;
      setStatus('CANCELLED');
      setMessage('SOS cancelled');
      setDemoNote('Demo note: duress alert saved silently in Alert History.');
      createAlert({
        triggerType: 'MANUAL_SOS',
        status: 'SILENT_DURESS_ACTIVE',
        visibleMessage: 'SOS cancelled',
        cancelMethod: 'DURESS_PIN'
      });
    } else {
      Alert.alert('Invalid PIN', 'The PIN you entered is incorrect.');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.container}>
          <Text style={styles.title}>Manual SOS</Text>
          
          <Text style={[styles.warningText, status === 'ACTIVE' && styles.activeText]}>
            {message}
          </Text>

          {locationStatus !== '' && (
            <Text style={styles.locationStatusText}>{locationStatus}</Text>
          )}

          {status === 'COUNTING_DOWN' && (
            <Text style={styles.countdownNumber}>{countdown}</Text>
          )}

          {status === 'COUNTING_DOWN' && (
            <View style={styles.inputContainer}>
              <TextInput
                style={[styles.pinInput, { color: '#111827' }]}
                placeholder="Enter PIN"
                placeholderTextColor="#6B7280"
                keyboardType="numeric"
                secureTextEntry
                value={pin}
                onChangeText={setPin}
                maxLength={4}
              />
              <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
                <Text style={styles.cancelButtonText}>Cancel SOS</Text>
              </TouchableOpacity>
            </View>
          )}

          {demoNote !== '' && (
            <Text style={styles.demoNote}>{demoNote}</Text>
          )}

          <View style={styles.helperCard}>
            <Text style={styles.helperText}>Real Cancel PIN: 1234</Text>
            <Text style={styles.helperText}>Duress PIN: 4321</Text>
            <Text style={styles.helperTextMuted}>This is demo mode.</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FFF7F7' },
  container: { flexGrow: 1, padding: 24, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 32, fontWeight: 'bold', color: '#DC2626', marginBottom: 16 },
  warningText: { fontSize: 18, color: '#111827', textAlign: 'center', marginBottom: 8, fontWeight: '600' },
  activeText: { color: '#DC2626', fontSize: 24, fontWeight: 'bold' },
  locationStatusText: { fontSize: 14, color: '#6B7280', textAlign: 'center', marginBottom: 24, fontStyle: 'italic' },
  countdownNumber: { fontSize: 72, fontWeight: 'bold', color: '#DC2626', marginBottom: 32 },
  inputContainer: { width: '100%', alignItems: 'center', marginBottom: 32 },
  pinInput: { 
    width: '80%', 
    height: 50, 
    borderWidth: 1, 
    borderColor: '#D1D5DB', 
    borderRadius: 8, 
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 16,
    letterSpacing: 8
  },
  cancelButton: {
    backgroundColor: '#111827',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 8,
    width: '80%',
    alignItems: 'center'
  },
  cancelButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
  demoNote: { color: '#7F1D1D', fontStyle: 'italic', marginBottom: 24, textAlign: 'center' },
  helperCard: {
    marginTop: 'auto',
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 8,
    width: '100%',
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 1
  },
  helperText: { fontSize: 14, color: '#111827', marginBottom: 4 },
  helperTextMuted: { fontSize: 12, color: '#6B7280', marginTop: 8, fontStyle: 'italic' },
});

