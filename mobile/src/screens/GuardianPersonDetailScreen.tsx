import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, Platform } from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { useGuardianPersonSummary } from '../hooks/useGuardianPersonSummary';
import { JourneyStatusCard } from '../components/guardian/JourneyStatusCard';
import { EmergencyAlertCard } from '../components/guardian/EmergencyAlertCard';
import { SectionHeader } from '../components/SectionHeader';
import { GuardianJourney, GuardianAlert, ActivityEvent } from '../types/guardian';
import { ActivityTimelineCard } from '../components/guardian/ActivityTimelineCard';
import { useGuardianDashboard } from '../hooks/useGuardianDashboard';

type PersonDetailRouteProp = RouteProp<RootStackParamList, 'GuardianPersonDetail'>;
type PersonDetailNavigationProp = NativeStackNavigationProp<RootStackParamList, 'GuardianPersonDetail'>;

export const GuardianPersonDetailScreen: React.FC = () => {
  const route = useRoute<PersonDetailRouteProp>();
  const navigation = useNavigation<PersonDetailNavigationProp>();
  const { protectedUserId, name, status } = route.params || {};

  const { summary, isLoading, error, refresh } = useGuardianPersonSummary(protectedUserId);
  const { model: dashboardModel } = useGuardianDashboard();
  
  const cachedAlerts = dashboardModel?.activeAlerts?.filter(a => a.user_id === protectedUserId) || [];
  const cachedJourneys = dashboardModel?.activeJourneys?.filter(j => j.user_id === protectedUserId) || [];

  if (!protectedUserId) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerContainer}>
          <Text style={styles.errorIcon}>⚠️</Text>
          <Text style={styles.errorText}>Could not open this protected person.</Text>
          <Text style={styles.subErrorText}>Missing user ID.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const handleViewAlertDetails = useCallback((alertId: string) => {
    navigation.navigate('GuardianAlertDetails', { alertId });
  }, [navigation]);

  const handleViewJourneyDetails = useCallback((journeyId: string) => {
    navigation.navigate('GuardianAlertDetails', { journeyId });
  }, [navigation]);

  const renderHeader = () => {
    const headerName = summary?.profile?.full_name || name || 'Protected Person';
    const headerStatus = status || 'SAFE'; // Fallback to SAFE or passed status since summary doesn't have it
    const phone = summary?.profile?.phone;
    const email = summary?.profile?.email;
    
    return (
      <View style={styles.profileHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{headerName.charAt(0) || '?'}</Text>
        </View>
        <View style={styles.profileInfo}>
          <Text style={styles.name}>{headerName}</Text>
          {!!headerStatus && <Text style={styles.contact}>Status: {headerStatus}</Text>}
          {!!phone && <Text style={styles.contact}>{phone}</Text>}
          {!!email && <Text style={styles.contact}>{email}</Text>}
        </View>
      </View>
    );
  };

  if (isLoading && !summary && !error) {
    return (
      <SafeAreaView style={styles.safeArea}>
        {renderHeader()}
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#4F46E5" />
          <Text style={styles.loadingText}>Loading person details...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error && !summary) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.container}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refresh} tintColor="#4F46E5" />}
        >
          {renderHeader()}
          
          <View style={styles.banner}>
            <Text style={styles.bannerTitle}>⚠️ Could not load protected person details.</Text>
            <Text style={styles.bannerText}>Pull down to retry or tap below.</Text>
            <View style={{ marginTop: 12 }}>
              <Text style={{ color: '#4F46E5', fontWeight: 'bold' }} onPress={() => refresh()}>Retry</Text>
            </View>
          </View>

          {cachedAlerts.length > 0 && (
            <View style={styles.section}>
              <SectionHeader title="Active Emergency Alerts" />
              {cachedAlerts.map(alert => (
                <EmergencyAlertCard key={`alert-${alert.id}`} alert={alert} onViewDetails={handleViewAlertDetails} />
              ))}
            </View>
          )}

          {cachedJourneys.length > 0 && (
            <View style={styles.section}>
              <SectionHeader title="Active Journey" />
              <JourneyStatusCard journey={cachedJourneys[0]} onViewDetails={handleViewJourneyDetails} />
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (!summary) return null;

  const profile = summary.profile;
  const recentAlertsAsEvents: ActivityEvent[] = summary.recent_activity.map((a: GuardianAlert) => ({
    id: `a_${a.id}`,
    user_id: a.user_id,
    type: a.trigger_type === 'SILENT_SOS' ? 'SILENT_SOS' : 'MANUAL_SOS',
    timestamp: a.created_at,
    title: a.trigger_type === 'SILENT_SOS' ? 'Silent SOS' : 'Emergency Alert',
    description: a.visible_message || `Alert triggered`,
    isEmergency: true
  }));
  
  const recentJourneysAsEvents: ActivityEvent[] = summary.recent_completed_journeys.map((j: GuardianJourney) => ({
    id: `j_${j.id}`,
    user_id: j.user_id,
    type: j.status === 'MISSED' ? 'MISSED_CHECKIN' : 'JOURNEY_COMPLETED',
    timestamp: j.status === 'MISSED' ? j.check_in_due_at || j.started_at : j.last_check_in_at || j.started_at,
    title: j.status === 'MISSED' ? 'Missed Check-in' : 'Journey Completed',
    description: j.status === 'MISSED' ? `Failed to check in on time.` : `Safe window concluded normally.`,
    isEmergency: j.status === 'MISSED'
  }));
  
  const recentActivity = [...recentAlertsAsEvents, ...recentJourneysAsEvents].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refresh} tintColor="#4F46E5" />}
      >
        {renderHeader()}

        {summary.active_alerts && summary.active_alerts.length > 0 && (
          <View style={styles.section}>
            <SectionHeader title="Active Emergency Alerts" />
            {summary.active_alerts.map(alert => (
              <EmergencyAlertCard key={`alert-${alert.id}`} alert={alert} onViewDetails={handleViewAlertDetails} />
            ))}
          </View>
        )}

        <View style={styles.section}>
          <SectionHeader title="Active Journey" />
          {summary.active_journey ? (
            <JourneyStatusCard journey={summary.active_journey} onViewDetails={handleViewJourneyDetails} />
          ) : (
            <Text style={styles.noteText}>Not currently on a journey.</Text>
          )}
        </View>

        <View style={styles.section}>
          <SectionHeader title="Recent Activity" />
          {recentActivity.length > 0 ? (
            recentActivity.map((activity, index) => (
              <ActivityTimelineCard key={`activity-${activity.id || index}`} activity={activity} isLast={index === recentActivity.length - 1} />
            ))
          ) : (
            <Text style={styles.noteText}>No recent activity recorded.</Text>
          )}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FAFAF9' },
  container: { padding: 24, paddingBottom: 48 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  loadingText: { marginTop: 16, fontSize: 16, color: '#64748B', fontWeight: '500' },
  errorIcon: { fontSize: 48, marginBottom: 16 },
  errorText: { fontSize: 18, color: '#1E293B', fontWeight: '700', textAlign: 'center', marginBottom: 8 },
  subErrorText: { fontSize: 14, color: '#64748B' },
  profileHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 32, backgroundColor: '#FFFFFF', padding: 16, borderRadius: 16, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4 },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#E0E7FF', justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  avatarText: { fontSize: 24, fontWeight: '700', color: '#4F46E5' },
  profileInfo: { flex: 1 },
  name: { fontSize: 22, fontWeight: '700', color: '#1E293B', marginBottom: 4 },
  contact: { fontSize: 14, color: '#64748B', marginBottom: 2 },
  section: { marginBottom: 32 },
  noteText: { fontSize: 14, color: '#64748B', fontStyle: 'italic' },
  banner: { backgroundColor: '#FFFBEB', padding: 16, borderRadius: 12, marginBottom: 24, borderWidth: 1, borderColor: '#FEF3C7' },
  bannerTitle: { fontSize: 14, fontWeight: '700', color: '#B45309', marginBottom: 4 },
  bannerText: { fontSize: 13, color: '#D97706' },
});
