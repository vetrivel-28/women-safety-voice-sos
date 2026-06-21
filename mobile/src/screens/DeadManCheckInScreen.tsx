import React from 'react';
import { View, Text, StyleSheet, SafeAreaView } from 'react-native';

export const DeadManCheckInScreen: React.FC = () => {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.title}>Dead Man Check-in</Text>
        <Text style={styles.text}>Check-in flow will be added here.</Text>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FFF7F7' },
  container: { flex: 1, padding: 24, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 28, fontWeight: 'bold', color: '#111827', marginBottom: 12, textAlign: 'center' },
  text: { fontSize: 16, color: '#6B7280', textAlign: 'center' },
});
