import React from 'react';
import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';

interface SafetyCardProps {
  title: string;
  subtitle: string;
  status?: string;
  onPress?: () => void;
}

export const SafetyCard: React.FC<SafetyCardProps> = ({ 
  title, 
  subtitle, 
  status, 
  onPress 
}) => {
  const CardContainer = onPress ? TouchableOpacity : View;

  return (
    <CardContainer 
      style={styles.card} 
      onPress={onPress}
      activeOpacity={onPress ? 0.8 : 1}
    >
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        {status && <Text style={styles.status}>{status}</Text>}
      </View>
      <Text style={styles.subtitle}>{subtitle}</Text>
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
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
  },
  status: {
    fontSize: 12,
    fontWeight: '500',
    color: '#F59E0B',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    overflow: 'hidden',
  },
});
