import React from 'react';
import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';

interface SafetyCardProps {
  title: string;
  subtitle: string;
  status?: string;
  onPress: () => void;
}

export const SafetyCard: React.FC<SafetyCardProps> = ({ title, subtitle, status, onPress }) => {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{title}</Text>
        {status && (
          <View style={styles.statusPill}>
            <Text style={styles.statusText}>{status}</Text>
          </View>
        )}
      </View>
      <Text style={styles.subtitle}>{subtitle}</Text>
      <View style={styles.footer}>
        <Text style={styles.actionText}>Manage Settings</Text>
        <Text style={styles.arrow}>→</Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#1E293B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#F8FAFC',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1E293B',
  },
  statusPill: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 14,
    color: '#64748B',
    marginBottom: 16,
    lineHeight: 20,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 12,
  },
  actionText: {
    fontSize: 14,
    color: '#4F46E5',
    fontWeight: '700',
    flex: 1,
  },
  arrow: {
    fontSize: 18,
    color: '#4F46E5',
    fontWeight: '700',
  },
});
