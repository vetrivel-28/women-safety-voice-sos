import React from 'react';
import { View, Text, StyleSheet, SafeAreaView } from 'react-native';

export const SafeWindowScreen: React.FC = () => {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.title}>Safe Window</Text>
        <Text style={styles.text}>Schedule safety monitoring windows here.</Text>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FFF7F7' },
  container: { flex: 1, padding: 24, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 28, fontWeight: 'bold', color: '#111827', marginBottom: 12 },
  text: { fontSize: 16, color: '#6B7280', textAlign: 'center' },
});
