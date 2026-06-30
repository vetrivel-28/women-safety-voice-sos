import React, { memo, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { GuardianJourney } from '../../types/guardian';

interface Props {
  journey: GuardianJourney;
  onViewDetails: (journeyId: string) => void;
}

const JourneyStatusCardComponent: React.FC<Props> = ({ journey, onViewDetails }) => {
  const [timeLeft, setTimeLeft] = useState(0);
  const [freshness, setFreshness] = useState(0);

  useEffect(() => {
    const endsAt = new Date(journey.ends_at).getTime();
    
    const updateTimer = () => {
      const now = new Date().getTime();
      const diff = Math.floor((endsAt - now) / 1000);
      setTimeLeft(diff > 0 ? diff : 0);
      
      if (journey.last_location_at) {
         setFreshness(Math.max(0, Math.floor((now - new Date(journey.last_location_at).getTime()) / 1000)));
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [journey.ends_at, journey.last_location_at]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const name = journey.profiles?.full_name || 'User';

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>{name}'s Journey</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>ACTIVE</Text>
        </View>
      </View>
      
      <View style={styles.detailsContainer}>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Started</Text>
          <Text style={styles.detailValue}>
            {new Date(journey.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Max Check-in Deadline</Text>
          <Text style={styles.detailValue}>
            {new Date(journey.ends_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
        {journey.route_status === 'calculated' && journey.distance_km != null && journey.estimated_duration_minutes != null && (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Expected Arrival</Text>
            <Text style={styles.detailValue}>
              {journey.estimated_arrival_at ? new Date(journey.estimated_arrival_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Unknown'} ({journey.distance_km} km)
            </Text>
          </View>
        )}
        {(journey.start_address || journey.start_latitude) && (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>From</Text>
            <Text style={[styles.detailValue, { flex: 1, textAlign: 'right', marginLeft: 16 }]} numberOfLines={2}>
              {journey.start_address || `${journey.start_latitude?.toFixed(4)}, ${journey.start_longitude?.toFixed(4)}`}
            </Text>
          </View>
        )}
        {(journey.destination_address || journey.destination_latitude) && (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>To</Text>
            <Text style={[styles.detailValue, { flex: 1, textAlign: 'right', marginLeft: 16 }]} numberOfLines={2}>
              {journey.destination_address || `${journey.destination_latitude?.toFixed(4)}, ${journey.destination_longitude?.toFixed(4)}`}
            </Text>
          </View>
        )}
        {journey.last_location_at && (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Location Freshness</Text>
            <Text style={styles.detailValueFresh}>
              {freshness}s ago
            </Text>
          </View>
        )}
      </View>

      <View style={styles.timerContainer}>
        <Text style={styles.timerLabel}>Time Remaining</Text>
        <Text style={styles.timerValue}>{formatTime(timeLeft)}</Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.button} onPress={() => onViewDetails(journey.id)}>
          <Text style={styles.buttonText}>View Journey</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export const JourneyStatusCard = memo(JourneyStatusCardComponent);

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#1E293B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1E293B',
  },
  badge: {
    backgroundColor: '#FEF08A',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    color: '#A16207',
    fontSize: 10,
    fontWeight: '800',
  },
  detailsContainer: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  detailLabel: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
  },
  detailValue: {
    fontSize: 13,
    color: '#1E293B',
    fontWeight: '700',
  },
  detailValueFresh: {
    fontSize: 13,
    color: '#10B981',
    fontWeight: '800',
  },
  timerContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  timerLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
    marginBottom: 4,
  },
  timerValue: {
    fontSize: 32,
    fontWeight: '900',
    color: '#1E293B',
    fontVariant: ['tabular-nums'],
  },
  actions: {
    flexDirection: 'row',
  },
  button: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonText: {
    color: '#334155',
    fontSize: 14,
    fontWeight: '700',
  },
});
