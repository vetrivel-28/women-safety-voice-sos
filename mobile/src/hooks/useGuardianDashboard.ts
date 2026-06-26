import { useState, useCallback, useRef, useEffect } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { apiClient } from '../api/client';
import { 
  GuardianDashboardModel, 
  GuardedUser, 
  GuardianJourney, 
  GuardianAlert, 
  ActivityEvent,
  GuardianStatus 
} from '../types/guardian';

const CACHE_TTL_MS = 10000; // 10 seconds
const POLL_INTERVAL_MS = 10000;

interface DashboardCache {
  data: GuardianDashboardModel | null;
  timestamp: number;
}

// Global in-memory cache
let globalCache: DashboardCache = { data: null, timestamp: 0 };
let globalFetchPromise: Promise<void> | null = null;

export const useGuardianDashboard = () => {
  const [model, setModel] = useState<GuardianDashboardModel>(
    globalCache.data || {
      guardedUsers: [],
      activeJourneys: [],
      activeAlerts: [],
      recentActivity: [],
      lastUpdated: null,
      isLoading: true,
      isRefreshing: false,
      error: null,
    }
  );

  const isFocusedRef = useRef(false);
  const appStateRef = useRef(AppState.currentState);

  const normalizeActivities = (journeys: GuardianJourney[], alerts: GuardianAlert[]): ActivityEvent[] => {
    const events: ActivityEvent[] = [];

    journeys.forEach(j => {
      const name = j.profiles?.full_name || 'User';
      
      // Journey Started
      if (j.started_at) {
        events.push({
          id: `j_start_${j.id}`,
          user_id: j.user_id,
          type: 'JOURNEY_STARTED',
          timestamp: j.started_at,
          title: 'Journey Started',
          description: `${name} started a journey.`,
          isEmergency: false,
        });
      }
      
      // Journey Completed
      if (j.status === 'COMPLETED' && j.ends_at) {
        events.push({
          id: `j_comp_${j.id}`,
          user_id: j.user_id,
          type: 'JOURNEY_COMPLETED',
          timestamp: j.ends_at, // Approximation for completion time
          title: 'Journey Completed',
          description: `${name} reached their destination safely.`,
          isEmergency: false,
        });
      }
    });

    alerts.forEach(a => {
      const name = a.profiles?.full_name || 'User';
      let type: ActivityEvent['type'] = 'MANUAL_SOS';
      let title = 'Emergency Alert';
      
      if (a.trigger_type === 'SILENT_SOS') {
        type = 'SILENT_SOS';
        title = 'Silent SOS';
      } else if (a.trigger_type === 'JOURNEY_MISSED_CHECKIN' || a.trigger_type === 'DEAD_MAN_MISSED' || a.trigger_type === 'SAFE_WINDOW_MISSED') {
        type = 'MISSED_CHECKIN';
        title = 'Missed Check-in';
      }

      events.push({
        id: `a_${a.id}`,
        user_id: a.user_id,
        type,
        timestamp: a.created_at,
        title,
        description: a.visible_message || `${name} triggered an SOS alert.`,
        isEmergency: true,
      });
    });

    return events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  };

  const deriveStatus = (
    userId: string, 
    activeJourneys: GuardianJourney[], 
    activeAlerts: GuardianAlert[]
  ): GuardianStatus => {
    const userAlerts = activeAlerts.filter(a => a.user_id === userId && a.status === 'ACTIVE');
    if (userAlerts.length > 0) {
      // Prioritize explicit SOS alerts
      return 'SOS ACTIVE';
    }

    const userJourneys = activeJourneys.filter(j => j.user_id === userId && j.status === 'ACTIVE');
    if (userJourneys.length > 0) {
      const activeJourney = userJourneys[0];
      const now = new Date().getTime();
      
      // Check if check-in is pending/missed but SOS not yet populated/fetched
      if (activeJourney.check_in_due_at && new Date(activeJourney.check_in_due_at).getTime() < now) {
        return 'CHECK-IN MISSED';
      }
      return 'JOURNEY ACTIVE';
    }

    return 'SAFE';
  };

  const fetchDashboardData = useCallback(async (forceRefresh = false) => {
    const now = Date.now();
    if (!forceRefresh && globalCache.data && (now - globalCache.timestamp < CACHE_TTL_MS)) {
      setModel(prev => ({ ...globalCache.data!, isLoading: false, isRefreshing: false }));
      return;
    }

    if (globalFetchPromise) {
      await globalFetchPromise;
      if (globalCache.data) {
        setModel(prev => ({ ...globalCache.data!, isLoading: false, isRefreshing: false }));
      }
      return;
    }

    // Don't flash 'isLoading' to true if we already have data (stale-while-revalidate fix)
    setModel(prev => ({ ...prev, isRefreshing: forceRefresh, isLoading: !globalCache.data && !forceRefresh, error: null }));

    const doFetch = async () => {
      try {
        // Fetch endpoints concurrently
      const [watchingRes, alertsRes, windowsRes] = await Promise.allSettled([
        apiClient.get('/api/guardians/watching'),
        apiClient.get('/api/guardians/alerts'),
        apiClient.get('/api/guardians/safe-windows')
      ]);

      let partialError = false;

      // Handle watching users
      const rawWatching = watchingRes.status === 'fulfilled' ? watchingRes.value.data : [];
      if (watchingRes.status === 'rejected') partialError = true;

      // Handle alerts
      const rawAlerts: GuardianAlert[] = alertsRes.status === 'fulfilled' ? alertsRes.value.data : [];
      if (alertsRes.status === 'rejected') partialError = true;

      // Handle journeys
      const rawJourneys: GuardianJourney[] = windowsRes.status === 'fulfilled' ? windowsRes.value.data : [];
      if (windowsRes.status === 'rejected') partialError = true;

      // Stale-While-Revalidate: If we have existing successful data, do not overwrite it with partial data
      if (partialError && globalCache.data) {
        setModel({
          ...globalCache.data,
          isLoading: false,
          isRefreshing: false,
          error: 'Unable to refresh. Showing previously loaded data.'
        });
        return;
      }

      // Ensure rawAlerts is sorted by created_at DESC (API should do this, but just in case)
      rawAlerts.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      // Only take the NEWEST active alert per user
      const seenActiveUsers = new Set<string>();
      const activeAlerts = rawAlerts.filter(a => {
        if (a.status !== 'ACTIVE') return false;
        if (seenActiveUsers.has(a.user_id)) return false;
        seenActiveUsers.add(a.user_id);
        return true;
      });

      const activeJourneys = rawJourneys.filter(j => j.status === 'ACTIVE');

      const guardedUsers: GuardedUser[] = rawWatching.map((w: any) => {
        const userId = w.protected_user_id;
        return {
          id: userId,
          name: w.name,
          email: w.email,
          phone: w.phone,
          status: deriveStatus(userId, activeJourneys, activeAlerts)
        };
      });

      const recentActivity = normalizeActivities(rawJourneys, rawAlerts);

      const newData: GuardianDashboardModel = {
        guardedUsers,
        activeJourneys,
        activeAlerts,
        recentActivity,
        lastUpdated: new Date().toISOString(),
        isLoading: false,
        isRefreshing: false,
        error: partialError ? 'Some data is temporarily unavailable.' : null,
      };

      globalCache = { data: newData, timestamp: Date.now() };
      setModel(newData);
    } catch (e: any) {
      // Only reach here if something entirely catastrophic happened (not API rejection)
      setModel(prev => ({
        ...prev,
        isLoading: false,
        isRefreshing: false,
        error: prev.lastUpdated ? 'Unable to refresh. Showing cached data.' : 'Unable to load Guardian Dashboard.',
      }));
    }
  };

  globalFetchPromise = doFetch();
    try {
      await globalFetchPromise;
    } finally {
      globalFetchPromise = null;
    }
  }, []);

  // Poll when screen is focused
  useFocusEffect(
    useCallback(() => {
      isFocusedRef.current = true;
      fetchDashboardData(false);

      const intervalId = setInterval(() => {
        if (isFocusedRef.current && appStateRef.current === 'active') {
          fetchDashboardData(false);
        }
      }, POLL_INTERVAL_MS);

      return () => {
        isFocusedRef.current = false;
        clearInterval(intervalId);
      };
    }, [fetchDashboardData])
  );

  // App state listener (background/foreground)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      appStateRef.current = nextAppState;
      if (nextAppState === 'active' && isFocusedRef.current) {
        fetchDashboardData(false);
      }
    });

    return () => {
      subscription.remove();
    };
  }, [fetchDashboardData]);

  // Alert dismissal
  const dismissAlert = useCallback(async (alertId: string) => {
    // Optimistic UI update
    setModel(prev => {
      const updatedAlerts = prev.activeAlerts.filter(a => a.id !== alertId);
      
      // Re-evaluate statuses for affected users
      const updatedUsers = prev.guardedUsers.map(u => ({
        ...u,
        status: deriveStatus(u.id, prev.activeJourneys, updatedAlerts)
      }));

      const newData = { ...prev, activeAlerts: updatedAlerts, guardedUsers: updatedUsers };
      globalCache.data = newData;
      return newData;
    });

    try {
      await apiClient.put(`/api/guardians/alerts/${alertId}/resolve`);
    } catch (e) {
      console.warn("Could not resolve alert on backend", e);
      // We don't rollback optimistic update here because the next fetch will restore it if it truly failed
    }
  }, []);

  return {
    model,
    refresh: () => fetchDashboardData(true),
    dismissAlert
  };
};
