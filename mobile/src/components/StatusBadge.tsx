import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface StatusBadgeProps {
  status: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  let bgColor = '#E5E7EB';
  let textColor = '#374151';

  switch (status.toUpperCase()) {
    case 'ACTIVE':
    case 'SILENT_DURESS_ACTIVE':
      bgColor = '#FEE2E2';
      textColor = '#DC2626';
      break;
    case 'RESOLVED':
    case 'CANCELLED':
    case 'SYNCED':
    case 'COMPLETED':
      bgColor = '#D1FAE5';
      textColor = '#059669';
      break;
    case 'PENDING SYNC':
    case 'MISSED':
    case 'MISSED_CHECKIN':
      bgColor = '#FEF3C7';
      textColor = '#D97706';
      break;
    case 'FAILED SYNC':
      bgColor = '#FCE7F3';
      textColor = '#DB2777';
      break;
  }

  return (
    <View style={[styles.badge, { backgroundColor: bgColor }]}>
      <Text style={[styles.text, { color: textColor }]}>
        {status.replace(/_/g, ' ')}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
});
