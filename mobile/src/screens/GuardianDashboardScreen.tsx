import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useEffect, useRef } from 'react';
import { 
  View, Text, StyleSheet, ScrollView, Platform, RefreshControl, 
  Pressable, Animated, useColorScheme 
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { useGuardianDashboard } from '../hooks/useGuardianDashboard';

type DashboardNavigationProp = NativeStackNavigationProp<RootStackParamList, 'GuardianDashboard'>;

// ── Material 3 Theme Tokens ───────────────────────────────────────────────
const createTheme = (isDark: boolean) => ({
  background: isDark ? '#121212' : '#F8FAFC',
  surface: isDark ? '#1E1E1E' : '#FFFFFF',
  surfaceVariant: isDark ? '#2C2C2C' : '#F1F5F9',
  onSurface: isDark ? '#E2E8F0' : '#0F172A',
  onSurfaceVariant: isDark ? '#94A3B8' : '#64748B',
  primary: isDark ? '#818CF8' : '#4F46E5',
  primaryContainer: isDark ? '#3730A3' : '#EEF2FF',
  onPrimaryContainer: isDark ? '#E0E7FF' : '#3730A3',
  error: isDark ? '#F87171' : '#EF4444',
  errorContainer: isDark ? '#7F1D1D' : '#FEF2F2',
  onErrorContainer: isDark ? '#FECACA' : '#991B1B',
  warning: isDark ? '#FBBF24' : '#F59E0B',
  warningContainer: isDark ? '#78350F' : '#FEF3C7',
  onWarningContainer: isDark ? '#FDE68A' : '#92400E',
  success: isDark ? '#34D399' : '#10B981',
  successContainer: isDark ? '#064E3B' : '#D1FAE5',
  onSuccessContainer: isDark ? '#6EE7B7' : '#065F46',
  border: isDark ? '#333333' : '#E2E8F0',
  offline: isDark ? '#6B7280' : '#94A3B8',
  offlineContainer: isDark ? '#374151' : '#F1F5F9',
});

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

// ── Shared Skeleton Component ─────────────────────────────────────────────
const SkeletonPulse = ({ style, isDark }: { style: any, isDark: boolean }) => {
  const anim = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.4, duration: 800, useNativeDriver: true })
      ])
    ).start();
  }, []);
  return (
    <Animated.View style={[
      style, 
      { opacity: anim, backgroundColor: isDark ? '#2C2C2C' : '#E2E8F0' }
    ]} />
  );
};

const StatusBadge = ({ status, theme }: { status: string, theme: any }) => {
  let color = theme.success;
  let bgColor = theme.successContainer;
  let label = status;
  let icon = '✅';

  if (status === 'SOS ACTIVE' || status === 'DANGER') {
    color = theme.error; bgColor = theme.errorContainer; label = 'SOS ACTIVE'; icon = '🚨';
  } else if (status === 'CHECK-IN MISSED' || status === 'WARNING') {
    color = theme.warning; bgColor = theme.warningContainer; label = 'MISSED'; icon = '⚠️';
  } else if (status === 'JOURNEY ACTIVE') {
    color = theme.primary; bgColor = theme.primaryContainer; label = 'JOURNEY'; icon = '🚶';
  } else if (status === 'OFFLINE') {
    color = theme.offline; bgColor = theme.offlineContainer; label = 'OFFLINE'; icon = '⚪';
  } else {
    label = 'SAFE'; icon = '✅';
  }

  return (
    <View style={[styles.badgeContainer, { backgroundColor: bgColor }]}>
      <Text style={[styles.badgeIcon]}>{icon}</Text>
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
};

export const GuardianDashboardScreen: React.FC = () => {
  const navigation = useNavigation<DashboardNavigationProp>();
  const { model, refresh } = useGuardianDashboard();
  
  const isDark = useColorScheme() === 'dark';
  const theme = createTheme(isDark);
  
  if (model.isLoading && !model.guardedUsers.length) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
        <View style={styles.headerContainer}>
          <Text style={[styles.headlineLarge, { color: theme.onSurface }]}>Guardian Command Center</Text>
          <Text style={[styles.labelSmall, { color: theme.onSurfaceVariant }]}>MY WARDS</Text>
        </View>
        <View style={styles.skeletonContainer}>
          {[1, 2, 3].map(i => (
            <View key={i} style={[styles.skeletonCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <SkeletonPulse style={[styles.skeletonAvatar]} isDark={isDark} />
              <View style={styles.skeletonTextContainer}>
                <SkeletonPulse style={[styles.skeletonTitle]} isDark={isDark} />
                <SkeletonPulse style={[styles.skeletonSubtitle]} isDark={isDark} />
              </View>
            </View>
          ))}
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
      if (!synthesized[uid]) synthesized[uid] = { protectedUserId: uid, name: a.profiles?.full_name || 'Unknown User', status: 'SOS ACTIVE', active_alerts: 0, active_journeys: 0, last_activity: a.created_at };
      synthesized[uid].active_alerts = (synthesized[uid].active_alerts || 0) + 1;
      synthesized[uid].status = 'SOS ACTIVE';
    });
    
    model.activeJourneys.forEach(j => {
      const uid = j.user_id;
      if (!uid) return;
      if (!synthesized[uid]) synthesized[uid] = { protectedUserId: uid, name: j.profiles?.full_name || 'Unknown User', status: 'SAFE', active_alerts: 0, active_journeys: 0, last_activity: j.started_at };
      synthesized[uid].active_journeys = (synthesized[uid].active_journeys || 0) + 1;
      if (synthesized[uid].status !== 'SOS ACTIVE') synthesized[uid].status = 'JOURNEY ACTIVE';
    });
    
    protectedUsers = Object.values(synthesized) as any;
  }

  const showEmptyState = dashboardLoaded && !dashboardError && protectedUsers.length === 0 && model.activeAlerts.length === 0 && model.activeJourneys.length === 0;

  // Compute top hero metrics
  const totalWards = protectedUsers.length;
  const activeAlertsCount = protectedUsers.filter(p => p.status === 'SOS ACTIVE' || p.status === 'CHECK-IN MISSED').length;
  const activeJourneysCount = protectedUsers.filter(p => p.status === 'JOURNEY ACTIVE').length;
  
  const isGlobalAlert = activeAlertsCount > 0;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <ScrollView 
        contentContainerStyle={styles.container} 
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={model.isRefreshing} onRefresh={refresh} tintColor={theme.primary} />
        }
      >
        <View style={styles.headerContainer}>
          <Text style={[styles.headlineLarge, { color: theme.onSurface }]}>Command Center</Text>
          
          {/* ── Hero Status ────────────────────────────────────────────── */}
          {!showEmptyState && (
            <View style={[
              styles.heroCard, 
              { backgroundColor: isGlobalAlert ? theme.errorContainer : theme.primaryContainer }
            ]}>
              <View style={styles.heroRow}>
                <Text style={{fontSize: 32}}>{isGlobalAlert ? '🚨' : '🛡️'}</Text>
                <View style={{flex: 1, marginLeft: 16}}>
                  <Text style={[styles.heroTitle, { color: isGlobalAlert ? theme.onErrorContainer : theme.onPrimaryContainer }]}>
                    {isGlobalAlert ? `${activeAlertsCount} Ward${activeAlertsCount > 1 ? 's' : ''} Needs Attention` : 'All Wards Protected'}
                  </Text>
                  <Text style={[styles.heroSubtitle, { color: isGlobalAlert ? theme.onErrorContainer : theme.onPrimaryContainer, opacity: 0.8 }]}>
                    {activeJourneysCount > 0 ? `${activeJourneysCount} active journey${activeJourneysCount > 1 ? 's' : ''}` : 'No active journeys right now'}
                  </Text>
                </View>
              </View>
            </View>
          )}
        </View>

        {showEmptyState ? (
          <View style={[styles.emptyContainer, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={styles.emptyIcon}>🛡️</Text>
            <Text style={[styles.emptyTitle, { color: theme.onSurface }]}>No wards linked yet</Text>
            <Text style={[styles.emptyText, { color: theme.onSurfaceVariant }]}>
              Go to Trusted Guardians and use "Add a Ward" to enter someone's ward code. They will appear here once linked.
            </Text>
          </View>
        ) : (
          <View style={styles.cardList}>
            <Text style={[styles.sectionTitle, { color: theme.onSurface }]}>Monitored Wards ({totalWards})</Text>
            
            {protectedUsers.map((person) => {
              const isAlert = person.status === 'SOS ACTIVE' || person.status === 'CHECK-IN MISSED';
              const isJourney = person.status === 'JOURNEY ACTIVE';
              
              return (
                <View key={`person-${person.protectedUserId}`} style={styles.cardWrapper}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.wardCard,
                      { backgroundColor: theme.surface, borderColor: isAlert ? theme.error : theme.border },
                      pressed && Platform.OS === 'ios' && { opacity: 0.7 }
                    ]}
                    android_ripple={{ color: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }}
                    onPress={() => {
                      navigation.navigate("GuardianPersonDetail", { protectedUserId: person.protectedUserId, name: person.name, status: person.status });
                    }}
                  >
                    <View style={styles.cardHeader}>
                      <View style={[styles.avatar, { backgroundColor: isAlert ? theme.errorContainer : theme.primaryContainer }]}>
                        <Text style={[styles.avatarText, { color: isAlert ? theme.error : theme.primary }]}>
                          {person.name?.[0]?.toUpperCase() || 'U'}
                        </Text>
                      </View>
                      
                      <View style={styles.cardInfo}>
                        <Text style={[styles.titleMedium, { color: theme.onSurface }]} numberOfLines={1}>
                          {person.name}
                        </Text>
                        <Text style={[styles.bodySmall, { color: theme.onSurfaceVariant }]}>
                          {person.active_alerts || 0} alert{(person.active_alerts !== 1) ? 's' : ''} · {person.active_journeys || 0} journey{(person.active_journeys !== 1) ? 's' : ''}
                        </Text>
                      </View>
                    </View>
                    
                    {/* Status area */}
                    <View style={[styles.cardFooter, { borderTopColor: theme.border }]}>
                      <StatusBadge status={person.status || ''} theme={theme} />
                      
                      <View style={{flexDirection: 'row', alignItems: 'center'}}>
                        <Text style={{fontSize: 12, color: theme.onSurfaceVariant, marginRight: 4}}>Last active:</Text>
                        <Text style={[styles.bodySmallTimestamp, { color: theme.onSurface }]}>
                          {formatRelative(person.last_activity)}
                        </Text>
                      </View>
                    </View>
                  </Pressable>
                </View>
              );
            })}
          </View>
        )}

        {dashboardFailedFallback && (
          <View style={[styles.banner, { backgroundColor: theme.warningContainer, borderColor: theme.warning }]}>
            <Text style={[styles.bannerTitle, { color: theme.onWarningContainer }]}>⚠️ Dashboard Error</Text>
            <Text style={[styles.bannerText, { color: theme.onWarningContainer, opacity: 0.9 }]}>
              Dashboard summary unavailable. Showing latest alerts and journeys from fallback data.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { paddingBottom: 48 },
  headerContainer: { paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 10 : 40, paddingBottom: 16 },
  
  // Material 3 Typography
  headlineLarge: { fontSize: 32, fontWeight: '800', marginBottom: 24, letterSpacing: -0.5 },
  labelSmall: { fontSize: 12, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 16 },
  titleMedium: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  bodySmall: { fontSize: 13, fontWeight: '500' },
  bodySmallTimestamp: { fontSize: 13, fontWeight: '600' },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12, marginLeft: 4 },
  
  // Hero
  heroCard: { padding: 20, borderRadius: 24, marginBottom: 8 },
  heroRow: { flexDirection: 'row', alignItems: 'center' },
  heroTitle: { fontSize: 20, fontWeight: '800', marginBottom: 4 },
  heroSubtitle: { fontSize: 14, fontWeight: '500' },

  // Layout & Cards
  cardList: { paddingHorizontal: 16, gap: 16 },
  cardWrapper: {
    borderRadius: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 4,
    overflow: 'hidden'
  },
  wardCard: { borderWidth: 1 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  avatar: { width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  avatarText: { fontSize: 22, fontWeight: '800' },
  cardInfo: { flex: 1, justifyContent: 'center' },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1 },
  
  // Badges
  badgeContainer: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  badgeIcon: { fontSize: 12, marginRight: 4 },
  badgeText: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  
  // Empty & Banner States
  emptyContainer: { marginHorizontal: 20, padding: 32, borderRadius: 24, alignItems: 'center', borderWidth: 1, borderStyle: 'dashed', marginTop: 16 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  emptyText: { fontSize: 15, textAlign: 'center', lineHeight: 22 },
  
  banner: { marginHorizontal: 20, padding: 16, borderRadius: 16, marginTop: 24, borderWidth: 1 },
  bannerTitle: { fontSize: 15, fontWeight: '800', marginBottom: 4 },
  bannerText: { fontSize: 13 },

  // Skeleton Loader
  skeletonContainer: { paddingHorizontal: 20, gap: 16 },
  skeletonCard: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 20, borderWidth: 1 },
  skeletonAvatar: { width: 56, height: 56, borderRadius: 28, marginRight: 16 },
  skeletonTextContainer: { flex: 1, gap: 12 },
  skeletonTitle: { height: 20, width: '60%', borderRadius: 6 },
  skeletonSubtitle: { height: 14, width: '40%', borderRadius: 6 }
});
