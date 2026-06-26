import React, { memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { GuardianAlert } from '../../types/guardian';

interface Props {
  alert: GuardianAlert;
  onViewDetails: (alertId: string) => void;
}

const EmergencyAlertCardComponent: React.FC<Props> = ({ alert, onViewDetails }) => {
  const name = alert.profiles?.full_name || 'User';

  let alertTitle = 'Emergency Alert';
  if (alert.trigger_type === 'SILENT_SOS') alertTitle = 'Silent SOS';
  else if (alert.trigger_type === 'JOURNEY_MISSED_CHECKIN' || alert.trigger_type === 'DEAD_MAN_MISSED' || alert.trigger_type === 'SAFE_WINDOW_MISSED') alertTitle = 'Missed Check-in';

  return (
    <View style={styles.card}>
      <View style={styles.emergencyBanner}>
        <Text style={styles.emergencyBannerText}>EMERGENCY</Text>
      </View>
      
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>{name}</Text>
          <Text style={styles.timeText}>
            {new Date(alert.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.label}>Alert Type:</Text>
          <Text style={styles.valueError}>{alertTitle}</Text>
        </View>

        {alert.visible_message ? (
          <View style={styles.messageBox}>
            <Text style={styles.messageText}>"{alert.visible_message}"</Text>
          </View>
        ) : null}

        <View style={styles.actions}>
          <TouchableOpacity style={styles.detailsBtn} onPress={() => onViewDetails(alert.id)}>
            <Text style={styles.detailsBtnText}>View Details & Take Action</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

export const EmergencyAlertCard = memo(EmergencyAlertCardComponent);

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#FEE2E2',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 4,
  },
  emergencyBanner: {
    backgroundColor: '#EF4444',
    paddingVertical: 8,
    alignItems: 'center',
  },
  emergencyBannerText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 14,
    letterSpacing: 2,
  },
  content: {
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    color: '#1E293B',
  },
  timeText: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '600',
  },
  infoRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  label: {
    width: 90,
    fontSize: 14,
    color: '#64748B',
    fontWeight: '600',
  },
  valueError: {
    flex: 1,
    fontSize: 14,
    color: '#EF4444',
    fontWeight: '800',
  },
  messageBox: {
    backgroundColor: '#FEF2F2',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#EF4444',
  },
  messageText: {
    color: '#991B1B',
    fontSize: 14,
    fontStyle: 'italic',
    fontWeight: '500',
  },
  actions: {
    marginTop: 8,
  },
  detailsBtn: {
    backgroundColor: '#EF4444',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  detailsBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
});
