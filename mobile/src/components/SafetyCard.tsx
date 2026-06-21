import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

interface SafetyCardProps {
  title: string;
  subtitle: string;
  status?: string;
  statusColor?: string;
  onPress?: () => void;
}

export const SafetyCard: React.FC<SafetyCardProps> = ({ 
  title, 
  subtitle, 
  status, 
  statusColor,
  onPress 
}) => {
  const CardContainer = onPress ? TouchableOpacity : View;

  return (
    <CardContainer style={styles.card} onPress={onPress}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{title}</Text>
        {status && (
          <View style={[styles.statusBadge, statusColor ? { backgroundColor: `${statusColor}20` } : {}]}>
            <Text style={[styles.statusText, statusColor ? { color: statusColor } : {}]}>{status}</Text>
          </View>
        )}
      </View>
      <Text style={styles.cardSubtitle}>{subtitle}</Text>
    </CardContainer>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
    width: '100%',
    borderColor: '#E5E7EB',
    borderWidth: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  cardSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
  },
  statusBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    overflow: 'hidden',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#F59E0B',
  },
});
