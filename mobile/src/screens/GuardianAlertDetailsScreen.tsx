import React, { useMemo, useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  SafeAreaView, 
  ScrollView, 
  Platform,
  Linking,
  TouchableOpacity,
  Alert
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { useGuardianDashboard } from '../hooks/useGuardianDashboard';
import { PrimaryButton } from '../components/PrimaryButton';
import { SectionHeader } from '../components/SectionHeader';

type AlertDetailsNavigationProp = NativeStackNavigationProp<RootStackParamList, 'GuardianAlertDetails'>;

export const GuardianAlertDetailsScreen: React.FC = () => {
  const route = useRoute<any>();
  const navigation = useNavigation<AlertDetailsNavigationProp>();
  const { alertId, journeyId } = route.params;
  const { model, dismissAlert } = useGuardianDashboard();

  const alert = useMemo(() => model.activeAlerts.find(a => a.id === alertId), [model.activeAlerts, alertId]);
  const journey = useMemo(() => model.activeJourneys.find(j => j.id === journeyId || j.user_id === alert?.user_id), [model.activeJourneys, journeyId, alert?.user_id]);
  const user = useMemo(() => model.guardedUsers.find(u => u.id === (alert?.user_id || journey?.user_id)), [model.guardedUsers, alert, journey]);

  if (!user && !alert && !journey) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>Details no longer available.</Text>
          <PrimaryButton title="Go Back" variant="outline" onPress={() => navigation.goBack()} />
        </View>
      </SafeAreaView>
    );
  }

  const name = user?.name || alert?.profiles?.full_name || journey?.profiles?.full_name || 'User';
  const phone = user?.phone || alert?.profiles?.phone || journey?.profiles?.phone || '';

  const handleCall = () => {
    if (phone) Linking.openURL(`tel:${phone}`).catch(() => Alert.alert('Could not launch dialer'));
  };

  const handleSMS = () => {
    if (phone) Linking.openURL(`sms:${phone}`).catch(() => Alert.alert('Could not launch SMS'));
  };

  const handleWhatsApp = () => {
    if (phone) Linking.openURL(`whatsapp://send?phone=${phone}`).catch(() => Alert.alert('WhatsApp is not installed'));
  };

  const handleNavigate = () => {
    const lat = alert?.location_lat || journey?.current_latitude || journey?.destination_latitude;
    const lng = alert?.location_long || journey?.current_longitude || journey?.destination_longitude;
    if (lat && lng) {
      Linking.openURL(`google.navigation:q=${lat},${lng}`).catch(() => Alert.alert('Google Maps is not installed'));
    }
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

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const handleDismiss = () => {
    if (alert) {
      dismissAlert(alert.id);
    }
    navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.safeArea}>
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

        {(alert?.location_lat || journey?.current_latitude || journey?.start_latitude) && (
          <>
            <SectionHeader title="Location Info" />
            <View style={styles.card}>
              <Text style={styles.label}>Live / Last Known Location</Text>
              <Text style={styles.value}>
                Lat: {alert?.location_lat || journey?.current_latitude || journey?.start_latitude}
                {'\n'}
                Lng: {alert?.location_long || journey?.current_longitude || journey?.start_longitude}
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
              {journey.start_latitude && (
                 <>
                   <Text style={styles.label}>Start Location</Text>
                   <Text style={[styles.value, { fontSize: 14, fontWeight: '500' }]}>
                     {journey.start_latitude.toFixed(5)}, {journey.start_longitude?.toFixed(5)}
                   </Text>
                 </>
              )}
              {journey.destination_latitude && (
                 <>
                   <Text style={styles.label}>Destination Location</Text>
                   <Text style={[styles.value, { fontSize: 14, fontWeight: '500' }]}>
                     {journey.destination_latitude.toFixed(5)}, {journey.destination_longitude?.toFixed(5)}
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
        <View style={styles.actionGrid}>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#E0E7FF' }]} onPress={handleCall}>
            <Text style={styles.actionIcon}>📞</Text>
            <Text style={styles.actionText}>Call</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#DCFCE7' }]} onPress={handleSMS}>
            <Text style={styles.actionIcon}>💬</Text>
            <Text style={styles.actionText}>SMS</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#D1FAE5' }]} onPress={handleWhatsApp}>
            <Text style={styles.actionIcon}>📱</Text>
            <Text style={styles.actionText}>WhatsApp</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#FEF9C3' }]} onPress={handleNavigate}>
            <Text style={styles.actionIcon}>🗺️</Text>
            <Text style={styles.actionText}>Navigate</Text>
          </TouchableOpacity>
        </View>

        {alert && (
          <PrimaryButton 
            title="Dismiss Alert" 
            variant="outline" 
            onPress={handleDismiss} 
            style={styles.dismissBtn} 
          />
        )}
      </ScrollView>
    </SafeAreaView>
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
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 32 },
  actionBtn: { flex: 1, minWidth: '45%', padding: 16, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  actionIcon: { fontSize: 24, marginBottom: 8 },
  actionText: { fontSize: 14, fontWeight: '800', color: '#1E293B' },
  dismissBtn: { marginTop: 16, borderColor: '#EF4444' },
});
