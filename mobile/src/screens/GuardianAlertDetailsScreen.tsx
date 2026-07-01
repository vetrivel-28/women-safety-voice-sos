import React, { useMemo, useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  Platform,
  Linking,
  TouchableOpacity,
  Alert
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { useGuardianDashboard } from '../hooks/useGuardianDashboard';
import { PrimaryButton } from '../components/PrimaryButton';
import { SectionHeader } from '../components/SectionHeader';
import { apiClient } from '../api/client';

type AlertDetailsNavigationProp = NativeStackNavigationProp<RootStackParamList, 'GuardianAlertDetails'>;

export const GuardianAlertDetailsScreen: React.FC = () => {
  const route = useRoute<any>();
  const navigation = useNavigation<AlertDetailsNavigationProp>();
  const insets = useSafeAreaInsets();
  const { alertId, journeyId } = route.params;
  const { model, dismissAlert } = useGuardianDashboard();

  const alert = useMemo(() => model.activeAlerts.find(a => a.id === alertId), [model.activeAlerts, alertId]);
  const journey = useMemo(() => model.activeJourneys.find(j => j.id === journeyId || j.user_id === alert?.user_id), [model.activeJourneys, journeyId, alert?.user_id]);
  const user = useMemo(() => model.guardedUsers.find(u => u.protectedUserId === (alert?.user_id || journey?.user_id)), [model.guardedUsers, alert, journey]);



  const name = user?.name || alert?.profiles?.full_name || journey?.profiles?.full_name || 'User';
  const phone = user?.phone || alert?.profiles?.phone || journey?.profiles?.phone || '';

  const handleCall = () => {
    if (phone) {
      Linking.openURL(`tel:${phone}`).catch(() => Alert.alert('Could not launch dialer'));
      handleAction('CALLED_WARD', true);
    } else {
      Alert.alert('Phone number unavailable.');
    }
  };

  const handleSMS = () => {
    if (phone) {
      const body = encodeURIComponent("Are you okay? I received your emergency alert.");
      Linking.openURL(`sms:${phone}?body=${body}`).catch(() => {
        Linking.openURL(`sms:${phone}`).catch(() => Alert.alert('Could not launch SMS'));
      });
      handleAction('MESSAGED_WARD', true);
    } else {
      Alert.alert('Phone number unavailable.');
    }
  };

  const handleWhatsApp = () => {
    if (phone) {
      const normalizedPhone = phone.replace(/[\s+]/g, '');
      const encodedMessage = encodeURIComponent("Are you okay? I received your emergency alert.");
      Linking.openURL(`whatsapp://send?phone=${normalizedPhone}&text=${encodedMessage}`).catch(() => {
        Linking.openURL(`https://wa.me/${normalizedPhone}?text=${encodedMessage}`).catch(() => Alert.alert('WhatsApp is not available on this device.'));
      });
      handleAction('MESSAGED_WARD', true);
    } else {
      Alert.alert('Phone number unavailable.');
    }
  };

  const handleNavigate = () => {
    let url = '';
    const destLat = alert?.location_lat || journey?.destination_latitude || journey?.current_latitude;
    const destLng = alert?.location_long || journey?.destination_longitude || journey?.current_longitude;
    const startLat = journey?.start_latitude;
    const startLng = journey?.start_longitude;

    if (startLat && startLng && destLat && destLng) {
      url = `https://www.google.com/maps/dir/?api=1&origin=${startLat},${startLng}&destination=${destLat},${destLng}`;
    } else if (destLat && destLng) {
      url = `https://www.google.com/maps/search/?api=1&query=${destLat},${destLng}`;
    } else {
      Alert.alert('Location unavailable');
      return;
    }
    
    Linking.openURL(url).catch(() => Alert.alert('Could not open maps'));
  };

  const [freshness, setFreshness] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(0);

  useEffect(() => {
    const targetDate = journey?.last_location_at || alert?.created_at;
    const endsAt = journey?.ends_at;
    
    const updateTimer = () => {
      const now = new Date().getTime();
      if (targetDate) {
        setFreshness(Math.max(0, Math.floor((now - new Date(targetDate).getTime()) / 1000)));
      }
      if (endsAt) {
        const diff = Math.floor((new Date(endsAt).getTime() - now) / 1000);
        setTimeLeft(diff > 0 ? diff : 0);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [journey?.last_location_at, alert?.created_at, journey?.ends_at]);

  const [events, setEvents] = useState<any[]>([]);
  const [actions, setActions] = useState<any[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);

  useEffect(() => {
    let mounted = true;
    const fetchEvents = async () => {
      // Validate UUID pattern to prevent 500
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(alertId || '');
      if (!alertId || !isUUID) return;
      
      try {
        setLoadingEvents(true);
        // Log view
        await apiClient.post(`/api/sos/${alertId}/view`);
        // Fetch events
        const res = await apiClient.get(`/api/sos/${alertId}/notification-events`);
        // Fetch guardian actions
        const actionsRes = await apiClient.get(`/api/guardians/alerts/${alertId}/actions`);
        if (mounted) {
          setEvents(res.data || []);
          setActions(actionsRes.data || []);
        }
      } catch (e: any) {
        if (e?.response?.status !== 404) {
          console.warn("Could not fetch events timeline", e);
        }
      } finally {
        if (mounted) setLoadingEvents(false);
      }
    };
    fetchEvents();
    return () => { mounted = false; };
  }, [alertId]);

  const [isSendingAction, setIsSendingAction] = useState(false);

  const handleAction = async (actionType: string, silent = false) => {
    if (!alertId || isSendingAction) return;
    try {
      setIsSendingAction(true);
      await apiClient.post(`/api/guardians/alerts/${alertId}/actions`, {
        action_type: actionType,
        message: `Guardian executed ${actionType.replace(/_/g, ' ')}`
      });
      if (!silent) Alert.alert('Success', 'Action recorded.');
      // Refresh events and actions
      const [eventsRes, actionsRes] = await Promise.all([
        apiClient.get(`/api/sos/${alertId}/notification-events`),
        apiClient.get(`/api/guardians/alerts/${alertId}/actions`)
      ]);
      setEvents(eventsRes.data || []);
      setActions(actionsRes.data || []);
    } catch (e: any) {
      console.warn('Failed to send action', e);
      if (!silent) {
         const msg = e?.response?.data?.detail || e?.message || "Could not record guardian action";
         Alert.alert('Error', msg);
      } else {
         Alert.alert('Notice', 'Opened successfully, but action logging failed.');
      }
    } finally {
      setIsSendingAction(false);
    }
  };

  if (!user && !alert && !journey) {
    return (
      <View style={[styles.safeArea, { paddingTop: Math.max(insets.top, 20), paddingBottom: insets.bottom }]}>
        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>Details no longer available.</Text>
          <PrimaryButton title="Go Back" variant="outline" onPress={() => navigation.goBack()} />
        </View>
      </View>
    );
  }

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const handleDismiss = async () => {
    if (alert) {
      await handleAction('DISMISSED_ALERT', true);
      dismissAlert(alert.id);
    }
    navigation.goBack();
  };

  return (
    <View style={[styles.safeArea, { paddingTop: Math.max(insets.top, 20), paddingBottom: Math.max(insets.bottom, 24) }]}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {alert && (
          <View style={styles.alertHeader}>
            <Text style={styles.alertIcon}>🚨</Text>
            <Text style={styles.alertTitle}>Emergency Alert Active</Text>
            <Text style={styles.alertTime}>
              Triggered at {new Date(alert.created_at).toLocaleTimeString()}
            </Text>
          </View>
        )}

        <SectionHeader title="User Details" />
        <View style={styles.card}>
          <Text style={styles.label}>Name</Text>
          <Text style={styles.value}>{name}</Text>
          
          <Text style={styles.label}>Phone</Text>
          <Text style={styles.value}>{phone || 'Unknown'}</Text>
        </View>

        {(alert?.location_lat != null || journey?.current_latitude != null || journey?.start_latitude != null) && (
          <>
            <SectionHeader title="Location Info" />
            <View style={styles.card}>
              <Text style={styles.label}>Live / Last Known Location</Text>
              <Text style={styles.value}>
                Lat: {Number(alert?.location_lat ?? journey?.current_latitude ?? journey?.start_latitude).toFixed(5)}
                {'\n'}
                Lng: {Number(alert?.location_long ?? journey?.current_longitude ?? journey?.start_longitude).toFixed(5)}
              </Text>
              
              {freshness !== null && (
                <>
                  <Text style={styles.label}>Location Freshness</Text>
                  <Text style={[styles.value, { color: '#10B981' }]}>Updated {freshness} seconds ago</Text>
                </>
              )}
            </View>
          </>
        )}

        {journey && (
          <>
            <SectionHeader title="Current Journey" />
            <View style={styles.card}>
              {(journey.start_address || journey.start_latitude) && (
                 <>
                   <Text style={styles.label}>Start Location</Text>
                   <Text style={[styles.value, { fontSize: 14, fontWeight: '500' }]}>
                     {journey.start_address || `${journey.start_latitude?.toFixed(5)}, ${journey.start_longitude?.toFixed(5)}`}
                   </Text>
                 </>
              )}
              {(journey.destination_address || journey.destination_latitude) && (
                 <>
                   <Text style={styles.label}>Destination Location</Text>
                   <Text style={[styles.value, { fontSize: 14, fontWeight: '500' }]}>
                     {journey.destination_address || `${journey.destination_latitude?.toFixed(5)}, ${journey.destination_longitude?.toFixed(5)}`}
                   </Text>
                 </>
              )}
              <Text style={styles.label}>Started At</Text>
              <Text style={styles.value}>{new Date(journey.started_at).toLocaleTimeString()}</Text>
              
              <Text style={styles.label}>Expected Arrival</Text>
              <Text style={styles.value}>{new Date(journey.ends_at).toLocaleTimeString()}</Text>

              <Text style={styles.label}>Time Remaining</Text>
              <Text style={[styles.value, { color: '#EF4444', fontWeight: 'bold' }]}>{formatTime(timeLeft)}</Text>
            </View>
          </>
        )}

        <SectionHeader title="Quick Actions" />
        <View style={styles.quickActionGrid}>
          <TouchableOpacity disabled={isSendingAction} style={[styles.quickActionCard, { backgroundColor: '#E0E7FF' }]} onPress={handleCall}>
            <Text style={styles.actionIcon}>📞</Text>
            <Text style={styles.actionText}>Call</Text>
          </TouchableOpacity>
          <TouchableOpacity disabled={isSendingAction} style={[styles.quickActionCard, { backgroundColor: '#DCFCE7' }]} onPress={handleSMS}>
            <Text style={styles.actionIcon}>💬</Text>
            <Text style={styles.actionText}>SMS</Text>
          </TouchableOpacity>
          <TouchableOpacity disabled={isSendingAction} style={[styles.quickActionCard, { backgroundColor: '#D1FAE5' }]} onPress={handleWhatsApp}>
            <Text style={styles.actionIcon}>📱</Text>
            <Text style={styles.actionText}>WhatsApp</Text>
          </TouchableOpacity>
          <TouchableOpacity disabled={isSendingAction} style={[styles.quickActionCard, { backgroundColor: '#FEF9C3' }]} onPress={handleNavigate}>
            <Text style={styles.actionIcon}>🗺️</Text>
            <Text style={styles.actionText}>Navigate</Text>
          </TouchableOpacity>
        </View>

        {alert && (
          <>
            <SectionHeader title="Acknowledge Alert" />
            <View style={styles.responseActionWrap}>
              <TouchableOpacity disabled={isSendingAction} style={[styles.responseActionButton, { backgroundColor: '#F3F4F6' }]} onPress={() => handleAction('VIEWED_ALERT')}>
                <Text style={styles.responseActionText}>👁️ Mark Viewed</Text>
              </TouchableOpacity>
              <TouchableOpacity disabled={isSendingAction} style={[styles.responseActionButton, { backgroundColor: '#DBEAFE' }]} onPress={() => handleAction('I_AM_RESPONDING')}>
                <Text style={styles.responseActionText}>🏃 Responding</Text>
              </TouchableOpacity>
              <TouchableOpacity disabled={isSendingAction} style={[styles.responseActionButton, { backgroundColor: '#DCFCE7' }]} onPress={() => handleAction('RESOLVED')}>
                <Text style={styles.responseActionText}>✅ Resolved</Text>
              </TouchableOpacity>
              <TouchableOpacity disabled={isSendingAction} style={[styles.responseActionButton, { backgroundColor: '#FEE2E2' }]} onPress={() => handleAction('FALSE_ALARM')}>
                <Text style={styles.responseActionText}>❌ False Alarm</Text>
              </TouchableOpacity>
              <TouchableOpacity disabled={isSendingAction} style={[styles.responseActionButton, { backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#D1D5DB' }]} onPress={handleDismiss}>
                <Text style={styles.responseActionText}>🛑 Dismiss</Text>
              </TouchableOpacity>
            </View>
          </>
        )}



        {alert && (
          <>
            <SectionHeader title="Guardian Actions" />
            <View style={styles.card}>
              {loadingEvents ? (
                <Text style={styles.label}>Loading actions...</Text>
              ) : actions.length === 0 ? (
                <Text style={styles.label}>No actions recorded yet.</Text>
              ) : (
                actions.map((act, idx) => (
                  <View key={act.id || idx} style={styles.eventRow}>
                    <View style={styles.eventHeader}>
                      <Text style={styles.eventTitle}>{act.action_type.replace(/_/g, ' ')}</Text>
                      <Text style={styles.eventTime}>{new Date(act.created_at).toLocaleTimeString()}</Text>
                    </View>
                    <Text style={styles.eventMessage}>By: {act.guardian_name}</Text>
                    {act.message && <Text style={styles.eventMessage}>{act.message}</Text>}
                    <View style={styles.eventFooter}>
                      <Text style={[styles.eventStatus, styles.statusSuccess]}>
                        Status: {act.status}
                      </Text>
                    </View>
                    {idx < actions.length - 1 && <View style={styles.eventDivider} />}
                  </View>
                ))
              )}
            </View>
            <SectionHeader title="Notification Timeline" />
            <View style={styles.card}>
              {loadingEvents ? (
                <Text style={styles.label}>Loading timeline...</Text>
              ) : events.length === 0 ? (
                <Text style={styles.label}>No events recorded yet.</Text>
              ) : (
                events.map((event, idx) => (
                  <View key={event.id || idx} style={styles.eventRow}>
                    <View style={styles.eventHeader}>
                      <Text style={styles.eventTitle}>{event.event_type.replace(/_/g, ' ')}</Text>
                      <Text style={styles.eventTime}>{new Date(event.created_at).toLocaleTimeString()}</Text>
                    </View>
                    <Text style={styles.eventMessage}>{event.message}</Text>
                    <View style={styles.eventFooter}>
                      <Text style={[
                        styles.eventStatus,
                        event.status === 'SUCCESS' || event.status === 'SENT' ? styles.statusSuccess :
                        event.status === 'FAILED' ? styles.statusFailed : styles.statusNeutral
                      ]}>
                        Status: {event.status}
                      </Text>
                    </View>
                    {idx < events.length - 1 && <View style={styles.eventDivider} />}
                  </View>
                ))
              )}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FAFAF9' },
  container: { padding: 24, paddingTop: Platform.OS === 'ios' ? 20 : 20, paddingBottom: 48 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  errorText: { fontSize: 16, color: '#64748B', marginBottom: 24 },
  alertHeader: { backgroundColor: '#FEF2F2', padding: 24, borderRadius: 16, alignItems: 'center', marginBottom: 32, borderWidth: 2, borderColor: '#FEE2E2' },
  alertIcon: { fontSize: 48, marginBottom: 8 },
  alertTitle: { fontSize: 20, fontWeight: '900', color: '#EF4444', marginBottom: 4 },
  alertTime: { fontSize: 14, color: '#991B1B', fontWeight: '500' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 20, marginBottom: 24, borderWidth: 1, borderColor: '#F1F5F9', shadowColor: '#1E293B', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12, elevation: 3 },
  label: { fontSize: 13, color: '#64748B', fontWeight: '600', marginBottom: 4 },
  value: { fontSize: 16, color: '#1E293B', fontWeight: '700', marginBottom: 16 },
  quickActionGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 24 },
  quickActionCard: { width: '48%', height: 76, borderRadius: 12, padding: 10, marginBottom: 16, alignItems: 'center', justifyContent: 'center' },
  actionIcon: { fontSize: 20, marginBottom: 4 },
  actionText: { fontSize: 14, fontWeight: '800', color: '#1E293B' },
  responseActionWrap: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 24, marginHorizontal: -4 },
  responseActionButton: { paddingVertical: 12, paddingHorizontal: 12, borderRadius: 12, margin: 4, flexGrow: 1, alignItems: 'center', justifyContent: 'center', minWidth: '45%' },
  responseActionText: { fontSize: 14, fontWeight: '700', color: '#1E293B' },
  dismissBtn: { marginTop: 8, borderColor: '#EF4444', marginBottom: 32 },
  eventRow: { marginBottom: 12 },
  eventHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  eventTitle: { fontSize: 14, fontWeight: '700', color: '#1E293B', textTransform: 'capitalize' },
  eventTime: { fontSize: 12, color: '#94A3B8' },
  eventMessage: { fontSize: 13, color: '#475569', marginBottom: 4 },
  eventFooter: { flexDirection: 'row', justifyContent: 'flex-start' },
  eventStatus: { fontSize: 12, fontWeight: '600' },
  statusSuccess: { color: '#10B981' },
  statusFailed: { color: '#EF4444' },
  statusNeutral: { color: '#F59E0B' },
  eventDivider: { height: 1, backgroundColor: '#F1F5F9', marginVertical: 12 },
});
