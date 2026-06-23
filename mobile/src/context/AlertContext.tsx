import React, { createContext, useState, useContext, useEffect } from 'react';
import { SOSAlert, TriggerType, AlertStatus } from '../types';
import { supabase } from '../lib/supabaseClient';

interface AlertContextType {
  alerts: SOSAlert[];
  createAlert: (params: {
    triggerType: TriggerType;
    status: AlertStatus;
    visibleMessage: string;
    cancelMethod?: 'REAL_PIN' | 'DURESS_PIN' | 'NONE';
    location?: SOSAlert['location'];
  }) => string;
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

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setCurrentUserId(session?.user?.id || 'local_guest');
    });

    // Listen to auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setCurrentUserId(session?.user?.id || 'local_guest');
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Sync function that can be called for new or pending alerts
  const syncToBackend = async (alert: SOSAlert, userId: string, guardian?: { name?: string, phone?: string, email?: string }) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        updateAlert(alert.id, { syncStatus: 'FAILED_SYNC', lastSyncError: 'No active session' });
        return;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const apiUrl = process.env.EXPO_PUBLIC_API_BASE_URL || 'http://127.0.0.1:8000';

      const response = await fetch(`${apiUrl}/api/sos/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          trigger_type: alert.triggerType,
          status: alert.status,
          cancel_method: alert.cancelMethod || 'NONE',
          visible_message: alert.visibleMessage,
          latitude: alert.location?.latitude,
          longitude: alert.location?.longitude,
          map_link: alert.location?.mapLink,
          guardian_name: guardian?.name,
          guardian_phone: guardian?.phone,
          guardian_email: guardian?.email
        }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errText = await response.text();
        updateAlert(alert.id, { syncStatus: 'FAILED_SYNC', lastSyncError: `HTTP ${response.status}` });
        return;
      }

      const responseData = await response.json();
      updateAlert(alert.id, { 
        syncStatus: 'SYNCED', 
        backendId: responseData.id,
        syncedAt: new Date().toISOString(),
        lastSyncError: undefined
      });

    } catch (err: any) {
      updateAlert(alert.id, { syncStatus: 'FAILED_SYNC', lastSyncError: err.message || 'Network error' });
    }
  };

  const createAlert = ({
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
  }): string => {
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

    // Silently attempt to sync to backend
    syncToBackend(newAlert, ownerId, {
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
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const apiUrl = process.env.EXPO_PUBLIC_API_BASE_URL || 'http://127.0.0.1:8000';
      const response = await fetch(`${apiUrl}/api/sos/${alert.backendId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          status: status,
          cancel_method: cancelMethod
        })
      });

      if (!response.ok) {
        console.warn('Failed to update alert status on backend');
        updateAlert(alertId, { syncStatus: 'PENDING_SYNC', lastSyncError: 'Backend status update pending (endpoint missing)' });
      } else {
        updateAlert(alertId, { syncStatus: 'SYNCED', lastSyncError: undefined });
      }
    } catch (err) {
      console.warn('Network error updating alert status', err);
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
    const pendingAlerts = alerts.filter(
      a => a.ownerUserId === currentUserId && (a.syncStatus === 'PENDING_SYNC' || a.syncStatus === 'FAILED_SYNC')
    );
    
    for (const alert of pendingAlerts) {
      updateAlert(alert.id, { syncStatus: 'PENDING_SYNC' });
      await syncToBackend(alert, alert.ownerUserId || 'local_guest');
    }
  };

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
