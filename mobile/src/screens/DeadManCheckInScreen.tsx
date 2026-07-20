import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'DeadManCheckIn'>;

/**
 * DeadManCheckInScreen is no longer a standalone screen.
 * Check-in management is embedded in SafeWindowScreen (Journey Mode).
 *
 * This screen immediately redirects to SafeWindow so no navigation entry
 * is left orphaned and the back-stack remains clean.
 */
export const DeadManCheckInScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();

  useEffect(() => {
    // Replace this screen with SafeWindow so the back button works correctly
    navigation.replace('SafeWindow');
  }, [navigation]);

  // Brief splash while the replace() takes effect
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#4F46E5" />
        <Text style={styles.text}>Opening Journey Mode…</Text>
        <Text style={styles.sub}>
          Check-in timer is managed inside Journey Mode.
        </Text>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FAFAF9' },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  text: {
    marginTop: 20,
    fontSize: 18,
    fontWeight: '700',
    color: '#1E293B',
    textAlign: 'center',
  },
  sub: {
    marginTop: 8,
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 20,
  },
});
