import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Platform, ActivityIndicator, RefreshControl, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { useGuardianDashboard } from '../hooks/useGuardianDashboard';

type DashboardNavigationProp = NativeStackNavigationProp<RootStackParamList, 'GuardianDashboard'>;

const formatRelative = (dateString?: string) => {
  if (!dateString) return 'Unknown';
  const diff = Date.now() - new Date(dateString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};

const StatusBadge = ({ status }: { status: string }) => {
  let color = '#10B981'; // safe
  if (status === 'DANGER') color = '#EF4444';
  else if (status === 'WARNING') color = '#F59E0B';
  else if (status === 'OFFLINE') color = '#9ca3af';

  return (
    <View style={{ backgroundColor: color + '20', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, alignSelf: 'flex-start' }}>
      <Text style={{ color, fontSize: 10, fontWeight: '800', textTransform: 'uppercase' }}>{status}</Text>
    </View>
  );
};

export const GuardianDashboardScreen: React.FC = () => {
  const navigation = useNavigation<DashboardNavigationProp>();
  const { model, refresh } = useGuardianDashboard();
  
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

  const dashboardLoaded = !model.isLoading;
  const dashboardError = !!model.error;
  
  let protectedUsers = model.guardedUsers;
  let dashboardFailedFallback = false;
  
  // Fallback tile synthesis
  if (dashboardError && (model.activeAlerts.length > 0 || model.activeJourneys.length > 0) && protectedUsers.length === 0) {
    dashboardFailedFallback = true;
    const synthesized: Record<string, any> = {};
    
    model.activeAlerts.forEach(a => {
      const uid = a.user_id;
      if (!uid) return;
      if (!synthesized[uid]) synthesized[uid] = { protectedUserId: uid, name: 'Unknown User', status: 'DANGER', active_alerts: 0, active_journeys: 0, last_activity: new Date().toISOString() };
      synthesized[uid].active_alerts = (synthesized[uid].active_alerts || 0) + 1;
      synthesized[uid].status = 'DANGER';
    });
    
    model.activeJourneys.forEach(j => {
      const uid = j.user_id;
      if (!uid) return;
      if (!synthesized[uid]) synthesized[uid] = { protectedUserId: uid, name: 'Unknown User', status: 'SAFE', active_alerts: 0, active_journeys: 0, last_activity: new Date().toISOString() };
      synthesized[uid].active_journeys = (synthesized[uid].active_journeys || 0) + 1;
      if (synthesized[uid].status !== 'DANGER') synthesized[uid].status = 'WARNING';
    });
    
    protectedUsers = Object.values(synthesized) as any;
  }

  const showEmptyState = dashboardLoaded && !dashboardError && protectedUsers.length === 0 && model.activeAlerts.length === 0 && model.activeJourneys.length === 0;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView 
        contentContainerStyle={styles.container} 
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={model.isRefreshing} onRefresh={refresh} tintColor="#4F46E5" />
        }
      >
        <Text style={styles.title}>Guardian Command Center</Text>
        <Text style={styles.sectionHeader}>People I'm Guarding</Text>

        {showEmptyState ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>🛡️</Text>
            <Text style={styles.emptyTitle}>You are not guarding anyone yet</Text>
            <Text style={styles.emptyText}>When someone adds you as a guardian, they will appear here.</Text>
          </View>
        ) : (
          <View style={styles.tileGrid}>
            {protectedUsers.map((person) => (
              <Pressable
                key={`person-${person.protectedUserId}`}
                style={styles.squareTile}
                onPress={() => {
                  console.log('[GUARDIAN TILE RAW]', JSON.stringify(person, null, 2));
                  console.log('[GUARDIAN TILE IDS]', {
                    protectedUserId: person.protectedUserId,
                    protected_user_id: (person as any).protected_user_id,
                    user_id: (person as any).user_id,
                    id: (person as any).id,
                  });
                  console.log('[OPEN PROTECTED PERSON PARAMS]', {
                    protectedUserId: person.protectedUserId,
                    name: person.name,
                    status: person.status,
                  });
                  navigation.navigate("GuardianPersonDetail", { protectedUserId: person.protectedUserId, name: person.name, status: person.status });
                }}
              >
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{person.name?.[0] || 'U'}</Text>
                </View>
                <Text style={styles.tileName} numberOfLines={1}>{person.name}</Text>
                <StatusBadge status={person.status} />
                <Text style={styles.tileCounts}>
                  {person.active_alerts || 0} alerts · {person.active_journeys || 0} journeys
                </Text>
                <Text style={styles.tileTimestamp}>{formatRelative(person.last_activity)}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {dashboardFailedFallback && (
          <View style={styles.banner}>
            <Text style={styles.bannerTitle}>⚠️ Dashboard Error</Text>
            <Text style={styles.bannerText}>
              Dashboard summary unavailable. Showing latest alerts and journeys.
            </Text>
          </View>
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
  title: { fontSize: 28, fontWeight: '900', color: '#1E293B', marginBottom: 16, letterSpacing: -0.5 },
  sectionHeader: { fontSize: 16, fontWeight: '700', color: '#64748B', marginBottom: 16, textTransform: 'uppercase', letterSpacing: 1 },
  
  tileGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
    gap: 12,
  },
  squareTile: {
    width: "48%", // Allow for slight padding and 2 per row
    aspectRatio: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    justifyContent: "space-between",
    shadowColor: '#1E293B', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2,
    borderWidth: 1, borderColor: '#F1F5F9'
  },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 16, fontWeight: '800', color: '#4F46E5' },
  tileName: { fontSize: 16, fontWeight: '700', color: '#1E293B' },
  tileCounts: { fontSize: 11, color: '#64748B', fontWeight: '500' },
  tileTimestamp: { fontSize: 10, color: '#94A3B8' },

  emptyContainer: { backgroundColor: '#FFFFFF', padding: 32, borderRadius: 20, alignItems: 'center', borderWidth: 1, borderColor: '#F1F5F9', borderStyle: 'dashed', marginTop: 32 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#1E293B', marginBottom: 4, textAlign: 'center' },
  emptyText: { fontSize: 14, color: '#64748B', textAlign: 'center', lineHeight: 20 },
  
  banner: { backgroundColor: '#FFFBEB', padding: 16, borderRadius: 12, marginTop: 24, borderWidth: 1, borderColor: '#FEF3C7' },
  bannerTitle: { fontSize: 14, fontWeight: '700', color: '#B45309', marginBottom: 4 },
  bannerText: { fontSize: 13, color: '#D97706' },
});
