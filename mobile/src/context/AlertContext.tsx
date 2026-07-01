import React, { createContext, useState, useContext, useEffect, useRef } from 'react';
import { SOSAlert, TriggerType, AlertStatus } from '../types';
import { supabase } from '../lib/supabaseClient';
import { apiClient } from '../api/client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { Alert } from 'react-native';

interface AlertContextType {
  alerts: SOSAlert[];
  createAlert: (params: {
    triggerType: TriggerType;
    status: AlertStatus;
    visibleMessage: string;
    cancelMethod?: 'REAL_PIN' | 'DURESS_PIN' | 'NONE';
    location?: SOSAlert['location'];
    guardian_name?: string;
    guardian_phone?: string;
    guardian_email?: string;
  }) => Promise<string>;
  updateAlert: (alertId: string, updates: Partial<SOSAlert>) => void;
  resolveAlert: (alertId: string) => Promise<void>;
  cancelAlert: (alertId: string, cancelMethod: 'REAL_PIN' | 'DURESS_PIN' | 'NONE') => Promise<void>;
  clearAlerts?: () => void;
  retryPendingAlerts: () => Promise<void>;
}

const AlertContext = createContext<AlertContextType | undefined>(undefined);

export const AlertProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [alerts, setAlerts] = useState<SOSAlert[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const retryInProgress = useRef(false);
  const alertsRef = useRef<SOSAlert[]>([]);

  useEffect(() => {
    alertsRef.current = alerts;
  }, [alerts]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setCurrentUserId(session?.user?.id || 'local_guest');
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setCurrentUserId(session?.user?.id || 'local_guest');
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const loadAlerts = async () => {
      try {
        const stored = await AsyncStorage.getItem('@safeher_alerts');
        if (stored) {
          const parsed = JSON.parse(stored);
          setAlerts(parsed);
        }
      } catch (e) {
        console.warn('Failed to load alerts from storage', e);
      } finally {
        setIsLoaded(true);
      }
    };
    loadAlerts();
  }, []);

  useEffect(() => {
    if (isLoaded) {
      AsyncStorage.setItem('@safeher_alerts', JSON.stringify(alerts)).catch(e => {
        console.warn('Failed to save alerts to storage', e);
      });
    }
  }, [alerts, isLoaded]);

  const syncToBackend = async (alert: SOSAlert, userId: string, guardian?: { name?: string, phone?: string, email?: string }) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        updateAlert(alert.id, { syncStatus: 'FAILED_SYNC', lastSyncError: 'No active session' });
        return;
      }

      const response = await apiClient.post('/api/sos/create', {
        trigger_type: alert.triggerType,
        status: alert.status,
        cancel_method: alert.cancelMethod || 'NONE',
        visible_message: alert.visibleMessage,
        latitude: alert.location?.latitude,
        longitude: alert.location?.longitude,
        location_accuracy: alert.location?.accuracy,
        location_captured_at: alert.location?.captured_at,
        location_provider: alert.location?.provider,
        location_permission_denied: alert.location?.permissionDenied,
        map_link: alert.location?.mapLink,
        guardian_name: guardian?.name,
        guardian_phone: guardian?.phone,
        guardian_email: guardian?.email
      });

      const responseData = response.data;
      updateAlert(alert.id, { 
        syncStatus: 'SYNCED', 
        backendId: responseData.id,
        syncedAt: new Date().toISOString(),
        lastSyncError: undefined
      });

    } catch (err: any) {
      updateAlert(alert.id, { syncStatus: 'FAILED_SYNC', lastSyncError: err.message || 'Network error' });
      throw err;
    }
  };

  const createAlert = async ({
    triggerType,
    status,
    visibleMessage,
    cancelMethod,
    location,
    guardian_name,
    guardian_phone,
    guardian_email
  }: {
    triggerType: TriggerType;
    status: AlertStatus;
    visibleMessage: string;
    cancelMethod?: 'REAL_PIN' | 'DURESS_PIN' | 'NONE';
    location?: SOSAlert['location'];
    guardian_name?: string;
    guardian_phone?: string;
    guardian_email?: string;
  }): Promise<string> => {
    const id = Date.now().toString();
    const ownerId = currentUserId || 'local_guest';
    const newAlert: SOSAlert = {
      id,
      triggerType,
      status,
      createdAt: new Date().toISOString(),
      visibleMessage,
      cancelMethod,
      location,
      syncStatus: 'PENDING_SYNC',
      ownerUserId: ownerId,
      ...(status === 'CANCELLED' || status === 'SILENT_DURESS_ACTIVE' ? { cancelledAt: new Date().toISOString() } : {})
    };

    setAlerts(prev => [newAlert, ...prev]);

    // Await sync to backend so caller can know when it's done
    await syncToBackend(newAlert, ownerId, {
      name: guardian_name,
      phone: guardian_phone,
      email: guardian_email
    });

    return id;
  };

  const syncAlertStatusToBackend = async (alertId: string, status: AlertStatus, cancelMethod: 'REAL_PIN' | 'DURESS_PIN' | 'NONE' = 'NONE') => {
    const alert = alerts.find(a => a.id === alertId);
    if (!alert || !alert.backendId) return;

    try {
      await apiClient.patch(`/api/sos/${alert.backendId}`, {
        status: status,
        cancel_method: cancelMethod
      });

      updateAlert(alertId, { syncStatus: 'SYNCED', lastSyncError: undefined });
    } catch (err) {
      updateAlert(alertId, { syncStatus: 'PENDING_SYNC', lastSyncError: 'Network error updating status' });
    }
  };

  const updateAlert = (alertId: string, updates: Partial<SOSAlert>) => {
    setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, ...updates } : a));
  };

  const resolveAlert = async (alertId: string) => {
    setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, status: 'RESOLVED', visibleMessage: 'Alert resolved' } : a));
    await syncAlertStatusToBackend(alertId, 'RESOLVED');
  };

  const cancelAlert = async (alertId: string, cancelMethod: 'REAL_PIN' | 'DURESS_PIN' | 'NONE') => {
    const newStatus = cancelMethod === 'DURESS_PIN' ? 'SILENT_DURESS_ACTIVE' : 'CANCELLED';
    setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, status: newStatus, cancelMethod, cancelledAt: new Date().toISOString() } : a));
    await syncAlertStatusToBackend(alertId, newStatus, cancelMethod);
  };

  const clearAlerts = () => {
    setAlerts(prev => prev.filter(a => a.ownerUserId !== currentUserId));
  };

  const retryPendingAlerts = async () => {
    if (retryInProgress.current || !isLoaded) return;
    retryInProgress.current = true;
    
    const pendingAlerts = alertsRef.current.filter(
      a => a.ownerUserId === currentUserId && (a.syncStatus === 'PENDING_SYNC' || a.syncStatus === 'FAILED_SYNC')
    );
    
    for (const alert of pendingAlerts) {
      if (!alert.backendId) {
        updateAlert(alert.id, { syncStatus: 'PENDING_SYNC' });
        await syncToBackend(alert, alert.ownerUserId || 'local_guest');
      } else {
        await syncAlertStatusToBackend(alert.id, alert.status, alert.cancelMethod || 'NONE');
      }
    }
    
    retryInProgress.current = false;
  };

  useEffect(() => {
    if (isLoaded && currentUserId) {
      const pendingAlerts = alertsRef.current.filter(
        a => a.ownerUserId === currentUserId && (a.syncStatus === 'PENDING_SYNC' || a.syncStatus === 'FAILED_SYNC')
      );
      if (pendingAlerts.length > 0) {
        Alert.alert(
          'Pending SOS Sync',
          'You have pending SOS alerts from when you were offline. Do you want to retry sending them?',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Retry', onPress: () => retryPendingAlerts() }
          ]
        );
      }
    }
  }, [isLoaded, currentUserId]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      // Intentionally not auto-retrying here to prevent accidental SOS without user consent
    });
    return () => unsubscribe();
  }, [isLoaded, currentUserId]);

  const visibleAlerts = alerts.filter(a => a.ownerUserId === currentUserId);

  return (
    <AlertContext.Provider value={{
      alerts: visibleAlerts,
      createAlert,
      updateAlert,
      resolveAlert,
      cancelAlert,
      clearAlerts,
      retryPendingAlerts
    }}>
      {children}
    </AlertContext.Provider>
  );
};

export const useAlert = () => {
  const context = useContext(AlertContext);
  if (!context) throw new Error('useAlert must be used within an AlertProvider');
  return context;
};
