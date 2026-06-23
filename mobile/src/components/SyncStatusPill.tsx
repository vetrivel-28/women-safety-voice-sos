import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface SyncStatusPillProps {
  isSynced: boolean;
  label?: string;
}

export const SyncStatusPill: React.FC<SyncStatusPillProps> = ({ isSynced, label }) => {
  return (
    <View style={[styles.pill, isSynced ? styles.synced : styles.offline]}>
      <View style={[styles.dot, isSynced ? styles.dotSynced : styles.dotOffline]} />
      <Text style={[styles.text, isSynced ? styles.textSynced : styles.textOffline]}>
        {label || (isSynced ? 'Cloud Sync Active' : 'Offline Mode')}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  synced: {
    backgroundColor: '#EEF2FF',
  },
  offline: {
    backgroundColor: '#FEF3C7',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  dotSynced: {
    backgroundColor: '#4F46E5',
  },
  dotOffline: {
    backgroundColor: '#D97706',
  },
  text: {
    fontSize: 12,
    fontWeight: '700',
  },
  textSynced: {
    color: '#4338CA',
  },
  textOffline: {
    color: '#B45309',
  },
});
