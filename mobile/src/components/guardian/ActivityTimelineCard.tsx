import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ActivityEvent } from '../../types/guardian';

interface Props {
  activity: ActivityEvent;
  isLast: boolean;
}

const getIcon = (type: string) => {
  switch (type) {
    case 'JOURNEY_STARTED': return '📍';
    case 'JOURNEY_COMPLETED': return '✅';
    case 'MISSED_CHECKIN': return '⏳';
    case 'MANUAL_SOS': return '🚨';
    case 'SILENT_SOS': return '🔇';
    default: return 'ℹ️';
  }
};

const ActivityTimelineCardComponent: React.FC<Props> = ({ activity, isLast }) => {
  const isEmergency = activity.isEmergency;
  const icon = getIcon(activity.type);

  return (
    <View style={styles.container}>
      <View style={styles.timelineColumn}>
        <View style={[styles.dot, isEmergency && styles.dotEmergency]} />
        {!isLast && <View style={styles.line} />}
      </View>
      <View style={styles.content}>
        <View style={styles.headerRow}>
          <Text style={styles.icon}>{icon}</Text>
          <Text style={[styles.title, isEmergency && styles.titleEmergency]}>{activity.title}</Text>
          <Text style={styles.timeText}>
            {new Date(activity.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
        <Text style={styles.description}>{activity.description}</Text>
      </View>
    </View>
  );
};

export const ActivityTimelineCard = memo(ActivityTimelineCardComponent);

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
  },
  timelineColumn: {
    width: 24,
    alignItems: 'center',
    marginRight: 12,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#CBD5E1',
    marginTop: 4,
    zIndex: 1,
  },
  dotEmergency: {
    backgroundColor: '#EF4444',
  },
  line: {
    width: 2,
    flex: 1,
    backgroundColor: '#F1F5F9',
    marginTop: -4,
    marginBottom: -4,
  },
  content: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  icon: {
    fontSize: 16,
    marginRight: 8,
  },
  title: {
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
    color: '#1E293B',
  },
  titleEmergency: {
    color: '#EF4444',
  },
  timeText: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '600',
  },
  description: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 20,
  },
});
