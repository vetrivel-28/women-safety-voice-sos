import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { StatusBadge } from './StatusBadge';
import { SOSAlert } from '../types';

interface AlertCardProps {
  alert: SOSAlert;
  onViewMap?: (link: string) => void;
}

export const AlertCard: React.FC<AlertCardProps> = ({ alert, onViewMap }) => {
  const isEmergency = alert.status === 'ACTIVE' || alert.status === 'SILENT_DURESS_ACTIVE';

  return (
    <View style={[styles.card, isEmergency && styles.emergencyCard]}>
      <View style={styles.header}>
        <Text style={styles.type}>{alert.triggerType.replace(/_/g, ' ')}</Text>
        <StatusBadge status={alert.status} />
      </View>
      
      {alert.syncStatus && (
        <View style={styles.syncContainer}>
          <Text style={[styles.syncText, alert.syncStatus === 'SYNCED' ? styles.syncSuccess : styles.syncError]}>
            {alert.syncStatus === 'PENDING_SYNC' && '⏳ Pending Sync'}
            {alert.syncStatus === 'FAILED_SYNC' && '⚠️ Failed Sync'}
            {alert.syncStatus === 'SYNCED' && '☁️ Synced'}
          </Text>
        </View>
      )}

      {alert.visibleMessage && (
        <View style={styles.messageBox}>
          <Text style={styles.messageText}>"{alert.visibleMessage}"</Text>
        </View>
      )}

      <View style={styles.footer}>
        <View style={styles.timeContainer}>
          <Text style={styles.timeLabel}>Created</Text>
          <Text style={styles.timeValue}>{new Date(alert.createdAt).toLocaleString()}</Text>
        </View>
        
        {alert.location?.mapLink && onViewMap && (
          <TouchableOpacity 
            style={styles.mapButton} 
            onPress={() => onViewMap(alert.location!.mapLink!)}
          >
            <Text style={styles.mapButtonText}>View on Map</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#1E293B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  emergencyCard: {
    borderColor: '#FEE2E2',
    backgroundColor: '#FFFAFA',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  type: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1E293B',
  },
  messageBox: {
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  messageText: {
    fontSize: 14,
    color: '#475569',
    fontStyle: 'italic',
  },
  syncContainer: {
    marginBottom: 8,
  },
  syncText: {
    fontSize: 12,
    fontWeight: '600',
  },
  syncSuccess: {
    color: '#059669',
  },
  syncError: {
    color: '#D97706',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: 4,
  },
  timeContainer: {
    flex: 1,
  },
  timeLabel: {
    fontSize: 11,
    color: '#94A3B8',
    textTransform: 'uppercase',
    fontWeight: '600',
    marginBottom: 2,
  },
  timeValue: {
    fontSize: 13,
    color: '#334155',
    fontWeight: '500',
  },
  mapButton: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginLeft: 10,
  },
  mapButtonText: {
    color: '#4F46E5',
    fontSize: 12,
    fontWeight: '700',
  },
});
