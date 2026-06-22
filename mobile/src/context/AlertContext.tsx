import React, { createContext, useState, useContext } from 'react';
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
  resolveAlert: (alertId: string) => void;
  clearAlerts?: () => void;
}

const AlertContext = createContext<AlertContextType | undefined>(undefined);

export const AlertProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [alerts, setAlerts] = useState<SOSAlert[]>([]);

  const createAlert = ({
    triggerType,
    status,
    visibleMessage,
    cancelMethod,
    location
  }: {
    triggerType: TriggerType;
    status: AlertStatus;
    visibleMessage: string;
    cancelMethod?: 'REAL_PIN' | 'DURESS_PIN' | 'NONE';
    location?: SOSAlert['location'];
  }): string => {
    const id = Date.now().toString();
    const newAlert: SOSAlert = {
      id,
      triggerType,
      status,
      createdAt: new Date().toISOString(),
      visibleMessage,
      cancelMethod,
      location,
      ...(status === 'CANCELLED' || status === 'SILENT_DURESS_ACTIVE' ? { cancelledAt: new Date().toISOString() } : {})
    };
    
    setAlerts(prev => [newAlert, ...prev]);
    
    // Silently attempt to sync to backend
    const syncToBackend = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://10.195.72.191:8000';
        
        await fetch(`${apiUrl}/api/alerts`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({
            trigger_type: triggerType,
            status: status,
            cancel_method: cancelMethod || 'NONE',
            visible_message: visibleMessage,
            latitude: location?.latitude,
            longitude: location?.longitude,
            map_link: location?.mapLink
          }),
          signal: controller.signal
        });
        clearTimeout(timeoutId);
      } catch (err) {
        // Silently fail as requested
        console.log('Backend sync failed silently', err);
      }
    };
    
    syncToBackend();
    
    return id;
  };

  const updateAlert = (alertId: string, updates: Partial<SOSAlert>) => {
    setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, ...updates } : a));
  };

  const resolveAlert = (alertId: string) => {
    setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, status: 'RESOLVED', visibleMessage: 'Alert resolved' } : a));
  };

  const clearAlerts = () => {
    setAlerts([]);
  };

  return (
    <AlertContext.Provider value={{
      alerts,
      createAlert,
      updateAlert,
      resolveAlert,
      clearAlerts
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
