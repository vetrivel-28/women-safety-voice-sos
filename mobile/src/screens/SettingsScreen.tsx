import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView } from 'react-native';

export const SettingsScreen: React.FC = () => {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Settings</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Demo PINs</Text>
          <View style={styles.card}>
            <Text style={styles.listItem}>• Real Cancel PIN: <Text style={styles.bold}>1234</Text></Text>
            <Text style={styles.listItem}>• Duress PIN: <Text style={styles.bold}>4321</Text></Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Privacy Note</Text>
          <View style={styles.card}>
            <Text style={styles.text}>SafeHer V1 does not use always-on microphone or camera.</Text>
            <Text style={[styles.text, { marginTop: 8 }]}>Voice, camera, and AI features are not included in V1.</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Current App Mode</Text>
          <View style={styles.card}>
            <Text style={styles.listItem}>✓ Manual SOS</Text>
            <Text style={styles.listItem}>✓ Silent SOS</Text>
            <Text style={styles.listItem}>✓ Real/Duress PIN</Text>
            <Text style={styles.listItem}>✓ Local contacts</Text>
            <Text style={styles.listItem}>✓ Local alert history</Text>
            <Text style={styles.listItem}>✓ Expo Go testing mode</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Coming Next</Text>
          <View style={styles.card}>
            <Text style={styles.listItemMuted}>• Location sharing</Text>
            <Text style={styles.listItemMuted}>• Safe Window timer</Text>
            <Text style={styles.listItemMuted}>• Dead Man Check-in</Text>
          </View>
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
  text: { fontSize: 14, color: '#4B5563', lineHeight: 20 },
  listItem: { fontSize: 15, color: '#111827', marginBottom: 8 },
  listItemMuted: { fontSize: 15, color: '#6B7280', marginBottom: 8 },
  bold: { fontWeight: 'bold' }
});
