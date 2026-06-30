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

let consecutiveErrors = 0;
let networkDownUntil = 0;

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
      
      if (j.status === 'COMPLETED' && j.ends_at) {
        events.push({
          id: `j_comp_${j.id}`,
          user_id: j.user_id,
          type: 'JOURNEY_COMPLETED',
          timestamp: j.ends_at,
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
    if (userAlerts.length > 0) return 'SOS ACTIVE';

    const userJourneys = activeJourneys.filter(j => j.user_id === userId && j.status === 'ACTIVE');
    if (userJourneys.length > 0) {
      const activeJourney = userJourneys[0];
      const now = new Date().getTime();
      
      if (activeJourney.check_in_due_at && new Date(activeJourney.check_in_due_at).getTime() < now) {
        return 'CHECK-IN MISSED';
      }
      return 'JOURNEY ACTIVE';
    }

    return 'SAFE';
  };

  const fetchDashboardData = useCallback(async (forceRefresh = false, signal?: AbortSignal) => {
    const now = Date.now();
    
    if (now < networkDownUntil && !forceRefresh) {
      return; // In backoff period
    }

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

    setModel(prev => ({ ...prev, isRefreshing: forceRefresh, isLoading: !globalCache.data && !forceRefresh, error: null }));

    const doFetch = async () => {
      try {
        let partialError = false;
        let isNetworkError = false;

        const [dashboardRes, alertsRes, journeysRes] = await Promise.all([
          apiClient.get('/api/guardians/dashboard', { signal }).catch(e => {
            if (e.isNetworkError) isNetworkError = true;
            return { data: null, error: e };
          }),
          apiClient.get('/api/guardians/alerts?active_only=true', { signal }).catch(() => ({ data: [] })),
          apiClient.get('/api/guardians/safe-windows?active_only=true', { signal }).catch(() => ({ data: [] }))
        ]);

        const rawDashboard = dashboardRes.data || [];
        if (!dashboardRes.data) {
          partialError = true;
        }

        if (partialError) {
          if (isNetworkError) {
            consecutiveErrors += 1;
            if (consecutiveErrors >= 2) {
              networkDownUntil = Date.now() + 30000; // 30s backoff
            }
          }
          if (globalCache.data) {
            setModel({
              ...globalCache.data,
              isLoading: false,
              isRefreshing: false,
              error: isNetworkError ? 'Cannot reach backend. Check that the backend is running on the same network.' : 'Some data is temporarily unavailable.'
            });
            return;
          }
        } else {
          consecutiveErrors = 0;
          networkDownUntil = 0;
        }

        const activeAlerts: GuardianAlert[] = alertsRes.data || [];
        const activeJourneys: GuardianJourney[] = journeysRes.data || [];

        const guardedUsers: GuardedUser[] = [];
        rawDashboard.forEach((w: any) => {
          const userId = w.protectedUserId || w.protected_user_id || w.user_id || w.id;
          
          if (!userId) {
            console.warn('[GuardianDashboard] Missing protected user id in dashboard item:', w);
            return;
          }
          
          let status: GuardianStatus = 'SAFE';
          if (w.active_alerts > 0) {
            status = 'SOS ACTIVE';
          } else if (w.active_journeys > 0) {
            status = 'JOURNEY ACTIVE';
          }

          guardedUsers.push({
            protectedUserId: userId,
            name: w.name,
            email: w.email,
            phone: w.phone,
            status,
            active_alerts: w.active_alerts,
            active_journeys: w.active_journeys,
            last_activity: w.last_activity,
            last_location: w.last_location,
          });
        });



        const severityMap = {
          'SOS ACTIVE': 0,
          'CHECK-IN MISSED': 1,
          'JOURNEY ACTIVE': 2,
          'SAFE': 3
        };
        guardedUsers.sort((a, b) => severityMap[a.status] - severityMap[b.status]);

        const recentActivity: ActivityEvent[] = normalizeActivities(activeJourneys, activeAlerts);

        const newData: GuardianDashboardModel = {
          guardedUsers,
          activeJourneys,
          activeAlerts,
          recentActivity,
          lastUpdated: new Date().toISOString(),
          isLoading: false,
          isRefreshing: false,
          error: partialError ? (isNetworkError ? 'Cannot reach backend. Check that the backend is running on the same network.' : 'Some data is temporarily unavailable.') : null,
        };

        globalCache = { data: newData, timestamp: Date.now() };
        setModel(newData);
      } catch (e: any) {
        if (e.name === 'CanceledError' || e.name === 'AbortError') return;
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

  useFocusEffect(
    useCallback(() => {
      isFocusedRef.current = true;
      const abortController = new AbortController();
      
      let timeoutId: NodeJS.Timeout;
      let isActive = true;

      const poll = async () => {
        if (!isActive || !isFocusedRef.current || appStateRef.current !== 'active') return;

        const hasIncident = globalCache.data?.activeAlerts?.length || globalCache.data?.activeJourneys?.length;
        const currentInterval = hasIncident ? 5000 : 30000; // 5s for emergency, 30s normal
        
        const timeSinceLastFetch = Date.now() - globalCache.timestamp;
        if (timeSinceLastFetch >= currentInterval) {
          await fetchDashboardData(true, abortController.signal).catch(() => {});
        }

        if (isActive) {
          timeoutId = setTimeout(poll, 5000);
        }
      };

      // Start initial fetch/poll on focus
      fetchDashboardData(true, abortController.signal).then(() => {
        if (isActive) {
          timeoutId = setTimeout(poll, 5000);
        }
      });

      return () => {
        isActive = false;
        isFocusedRef.current = false;
        clearTimeout(timeoutId);
        abortController.abort();
      };
    }, [fetchDashboardData])
  );

  // AppState listener (background/foreground)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      appStateRef.current = nextAppState;
      if (nextAppState === 'active' && isFocusedRef.current) {
        const timeSinceLastFetch = Date.now() - globalCache.timestamp;
        if (timeSinceLastFetch >= 5000) {
          fetchDashboardData(true).catch(() => {});
        }
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
        status: deriveStatus(u.protectedUserId, prev.activeJourneys, updatedAlerts)
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
