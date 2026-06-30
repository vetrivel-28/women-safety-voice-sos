import { useState, useCallback, useEffect } from 'react';
import { apiClient } from '../api/client';
import { GuardianAlert, GuardianJourney, ActivityEvent } from '../types/guardian';

export interface GuardianPersonSummary {
  profile: {
    id: string;
    full_name: string;
    phone: string;
    email: string;
  };
  active_journey: GuardianJourney | null;
  active_alerts: GuardianAlert[];
  recent_completed_journeys: GuardianJourney[];
  recent_activity: GuardianAlert[]; // Backend returns alerts for recent activity
}

export const useGuardianPersonSummary = (protectedUserId: string) => {
  const [summary, setSummary] = useState<GuardianPersonSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSummary = useCallback(async (isPolling = false) => {
    if (!isPolling) {
      setIsLoading(true);
      setError(null);
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

    try {
      const res = await apiClient.get(`/api/guardians/users/${protectedUserId}/summary`, {
        signal: controller.signal
      });
      setSummary(res.data);
    } catch (e: any) {
      if (e.name === 'CanceledError' || e.name === 'AbortError') {
        setError('Request timed out. Please try again.');
      } else {
        setError(e.message || 'Failed to load user summary');
      }
    } finally {
      if (!isPolling) {
        setIsLoading(false);
      }
    }
  }, [protectedUserId]);

  useEffect(() => {
    let isMounted = true;

    const poll = async () => {
      if (!isMounted || !protectedUserId) return;
      
      await fetchSummary(true);
      
      if (isMounted) {
        // We use the state value inside the component, but here we can just read from the previous fetch result indirectly
        // Actually, since we need to know if we should poll at 5s or 30s based on the *latest* summary:
        // We will schedule the next poll in a new effect that depends on `summary`.
      }
    };

    if (protectedUserId) {
      fetchSummary();
    }
    
    return () => {
      isMounted = false;
    };
  }, [protectedUserId, fetchSummary]);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout | undefined;
    
    if (summary) {
      const hasActive = (summary.active_alerts && summary.active_alerts.length > 0) || summary.active_journey;
      const interval = hasActive ? 5000 : 30000;
      
      timeoutId = setTimeout(() => {
        fetchSummary(true);
      }, interval);
    }
    
    return () => clearTimeout(timeoutId);
  }, [summary, fetchSummary]);

  return { summary, isLoading, error, refresh: fetchSummary };
};
