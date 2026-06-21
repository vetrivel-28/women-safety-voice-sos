import React, { createContext, useState, useContext } from 'react';
import { SOSAlert, TriggerType, AlertStatus } from '../types';

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
