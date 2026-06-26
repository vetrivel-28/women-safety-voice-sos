import React, { useCallback } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  SafeAreaView, 
  ScrollView, 
  Platform, 
  ActivityIndicator,
  RefreshControl 
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { useGuardianDashboard } from '../hooks/useGuardianDashboard';
import { GuardianUserCard } from '../components/guardian/GuardianUserCard';
import { JourneyStatusCard } from '../components/guardian/JourneyStatusCard';
import { EmergencyAlertCard } from '../components/guardian/EmergencyAlertCard';
import { ActivityTimelineCard } from '../components/guardian/ActivityTimelineCard';
import { SectionHeader } from '../components/SectionHeader';

type DashboardNavigationProp = NativeStackNavigationProp<RootStackParamList, 'GuardianDashboard'>;

export const GuardianDashboardScreen: React.FC = () => {
  const navigation = useNavigation<DashboardNavigationProp>();
  const { model, refresh } = useGuardianDashboard();

  const handleViewAlertDetails = useCallback((alertId: string) => {
    navigation.navigate('GuardianAlertDetails', { alertId });
  }, [navigation]);

  const handleViewJourneyDetails = useCallback((journeyId: string) => {
    navigation.navigate('GuardianAlertDetails', { journeyId });
  }, [navigation]);

  if (model.isLoading && !model.guardedUsers.length) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#4F46E5" />
          <Text style={styles.loadingText}>Loading dashboard...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (model.error && !model.guardedUsers.length) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerContainer}>
          <Text style={styles.errorIcon}>⚠️</Text>
          <Text style={styles.errorText}>{model.error}</Text>
          <Text style={styles.subErrorText}>Pull down to retry.</Text>
          <ScrollView
            contentContainerStyle={{ flexGrow: 1 }}
            refreshControl={<RefreshControl refreshing={model.isRefreshing} onRefresh={refresh} />}
          />
        </View>
      </SafeAreaView>
    );
  }

  const isEmpty = model.guardedUsers.length === 0;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView 
        contentContainerStyle={styles.container} 
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl 
            refreshing={model.isRefreshing} 
            onRefresh={refresh} 
            tintColor="#4F46E5"
          />
        }
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Command Center</Text>
            {model.lastUpdated && (
              <Text style={styles.subtitle}>
                Updated: {new Date(model.lastUpdated).toLocaleTimeString()}
              </Text>
            )}
          </View>
          {model.error && (
             <View style={styles.offlineBadge}>
               <Text style={styles.offlineText}>Offline</Text>
             </View>
          )}
        </View>

        {model.error && !isEmpty && (
          <View style={styles.warningBanner}>
            <Text style={styles.warningBannerTitle}>⚠️ {model.error}</Text>
            <Text style={styles.warningBannerText}>
              Showing previously loaded data from {model.lastUpdated ? new Date(model.lastUpdated).toLocaleTimeString() : 'earlier'}.
            </Text>
          </View>
        )}

        {isEmpty ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>🛡️</Text>
            <Text style={styles.emptyTitle}>You are not guarding anyone yet.</Text>
            <Text style={styles.emptyText}>When someone adds you as a guardian, they will appear here.</Text>
          </View>
        ) : (
          <>
            <SectionHeader title="People I'm Guarding" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalScroll}>
              {model.guardedUsers.map(user => (
                <GuardianUserCard key={user.id} user={user} />
              ))}
            </ScrollView>

            {model.activeAlerts.length > 0 && (
              <View style={styles.section}>
                <SectionHeader title="Emergency Alerts" />
                {model.activeAlerts.map(alert => (
                  <EmergencyAlertCard 
                    key={alert.id} 
                    alert={alert} 
                    onViewDetails={handleViewAlertDetails} 
                  />
                ))}
              </View>
            )}

            <View style={styles.section}>
              <SectionHeader title="Active Journeys" />
              {model.activeJourneys.length === 0 ? (
                <Text style={styles.noteText}>No active journeys.</Text>
              ) : (
                model.activeJourneys.map(journey => (
                  <JourneyStatusCard 
                    key={journey.id} 
                    journey={journey} 
                    onViewDetails={handleViewJourneyDetails} 
                  />
                ))
              )}
            </View>

            <View style={styles.section}>
              <SectionHeader title="Recent Activity" />
              {model.recentActivity.length === 0 ? (
                <Text style={styles.noteText}>Everything looks safe.</Text>
              ) : (
                model.recentActivity.slice(0, 10).map((activity, index) => (
                  <ActivityTimelineCard 
                    key={activity.id} 
                    activity={activity} 
                    isLast={index === Math.min(model.recentActivity.length, 10) - 1} 
                  />
                ))
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FAFAF9' },
  container: { padding: 24, paddingTop: Platform.OS === 'ios' ? 20 : 60, paddingBottom: 48 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  loadingText: { marginTop: 16, fontSize: 16, color: '#64748B', fontWeight: '500' },
  errorIcon: { fontSize: 48, marginBottom: 16 },
  errorText: { fontSize: 18, color: '#1E293B', fontWeight: '700', textAlign: 'center', marginBottom: 8 },
  subErrorText: { fontSize: 14, color: '#64748B' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 },
  title: { fontSize: 28, fontWeight: '900', color: '#1E293B', marginBottom: 4, letterSpacing: -0.5 },
  subtitle: { fontSize: 13, color: '#64748B', fontWeight: '500' },
  offlineBadge: { backgroundColor: '#FEE2E2', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  offlineText: { color: '#EF4444', fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
  horizontalScroll: { marginBottom: 32, overflow: 'visible' },
  section: { marginBottom: 32 },
  noteText: { fontSize: 14, color: '#64748B', fontStyle: 'italic' },
  emptyContainer: { backgroundColor: '#FFFFFF', padding: 32, borderRadius: 20, alignItems: 'center', borderWidth: 1, borderColor: '#F1F5F9', borderStyle: 'dashed', marginTop: 32 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#1E293B', marginBottom: 4, textAlign: 'center' },
  emptyText: { fontSize: 14, color: '#64748B', textAlign: 'center', lineHeight: 20 },
  warningBanner: { backgroundColor: '#FFFBEB', padding: 16, borderRadius: 12, marginBottom: 24, borderWidth: 1, borderColor: '#FEF3C7' },
  warningBannerTitle: { fontSize: 14, fontWeight: '700', color: '#B45309', marginBottom: 4 },
  warningBannerText: { fontSize: 13, color: '#D97706' },
});
