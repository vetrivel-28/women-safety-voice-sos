import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { GuardedUser, GuardianStatus } from '../../types/guardian';

interface Props {
  user: GuardedUser;
}

const getStatusColor = (status: GuardianStatus) => {
  switch (status) {
    case 'SOS ACTIVE': return '#EF4444'; // Red
    case 'CHECK-IN MISSED': return '#F97316'; // Orange
    case 'JOURNEY ACTIVE': return '#EAB308'; // Yellow
    case 'SAFE': return '#10B981'; // Green
    default: return '#64748B'; // Gray
  }
};

const GuardianUserCardComponent: React.FC<Props> = ({ user }) => {
  const statusColor = getStatusColor(user.status);
  const initial = user.name ? user.name.charAt(0).toUpperCase() : 'U';

  return (
    <View style={styles.card}>
      <View style={styles.avatarContainer}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
      </View>
      <View style={styles.infoContainer}>
        <Text style={styles.name} numberOfLines={1}>{user.name}</Text>
        <Text style={styles.email} numberOfLines={1}>{user.email}</Text>
      </View>
      <View style={styles.statusContainer}>
        <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
        <Text style={[styles.statusText, { color: statusColor }]}>{user.status}</Text>
      </View>
    </View>
  );
};

export const GuardianUserCard = memo(GuardianUserCardComponent);

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginRight: 12,
    width: 220,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#1E293B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  avatarContainer: {
    marginBottom: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  avatarText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#475569',
  },
  infoContainer: {
    marginBottom: 12,
  },
  name: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1E293B',
    marginBottom: 2,
  },
  email: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '800',
  },
});
