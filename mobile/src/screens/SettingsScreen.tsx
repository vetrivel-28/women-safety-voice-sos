import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { supabase } from '../lib/supabaseClient';

export const SettingsScreen: React.FC = () => {
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
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Settings</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>1. Demo PINs</Text>
          <View style={styles.card}>
            <Text style={styles.listItem}>• Real Cancel PIN: <Text style={styles.bold}>1234</Text></Text>
            <Text style={styles.listItem}>• Duress PIN: <Text style={styles.bold}>4321</Text></Text>
            <Text style={styles.note}>Note: These are demo values for V1 testing.</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>2. Privacy Note</Text>
          <View style={styles.card}>
            <Text style={styles.listItem}>• SafeHer V1 does not use always-on microphone.</Text>
            <Text style={styles.listItem}>• SafeHer V1 does not use camera or evidence capture.</Text>
            <Text style={styles.listItem}>• Safe Window and Check-in work while the app is open in Expo Go.</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>3. Current V1 Features</Text>
          <View style={styles.card}>
            <Text style={styles.listItem}>✓ Home Safety Dashboard</Text>
            <Text style={styles.listItem}>✓ Emergency Contacts</Text>
            <Text style={styles.listItem}>✓ Settings</Text>
            <Text style={styles.listItem}>✓ Safe Window timer</Text>
            <Text style={styles.listItem}>✓ Dead Man Check-in timer</Text>
            <Text style={styles.listItem}>✓ Missed check-in detection</Text>
            <Text style={styles.listItem}>✓ Expo Go testing mode</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>4. Coming Next</Text>
          <View style={styles.card}>
            <Text style={styles.listItemMuted}>• Missed check-in → Silent SOS integration after AlertContext merge</Text>
            <Text style={styles.listItemMuted}>• Location sharing</Text>
            <Text style={styles.listItemMuted}>• Google Maps link</Text>
            <Text style={styles.listItemMuted}>• Backend integration</Text>
            <Text style={styles.listItemMuted}>• Guardian dashboard</Text>
            <Text style={styles.listItemMuted}>• SMS/email notification service</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Text style={styles.logoutButtonText}>Log Out</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FFF7F7' },
  container: { flexGrow: 1, padding: 24 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#111827', marginBottom: 24 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#111827', marginBottom: 12 },
  card: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 1
  },
  listItem: { fontSize: 15, color: '#111827', marginBottom: 8 },
  listItemMuted: { fontSize: 15, color: '#6B7280', marginBottom: 8 },
  bold: { fontWeight: 'bold' },
  note: { fontSize: 14, color: '#6B7280', fontStyle: 'italic', marginTop: 8 },
  logoutButton: {
    backgroundColor: '#EF4444',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  logoutButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  }
});
