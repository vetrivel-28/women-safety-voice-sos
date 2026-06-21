import React, { createContext, useState, useContext, useEffect } from 'react';
import { SafeWindowState, SafeWindowDuration } from '../types';

interface SafeWindowContextType {
  safeWindow: SafeWindowState;
  startSafeWindow: (durationMinutes: SafeWindowDuration) => void;
  endSafeWindow: () => void;
  markCheckInSafe: () => void;
  markMissedCheckIn: () => void;
  getRemainingSeconds: () => number;
  getCheckInRemainingSeconds: () => number;
}

const SafeWindowContext = createContext<SafeWindowContextType | undefined>(undefined);

const initialState: SafeWindowState = {
  status: 'INACTIVE',
  durationMinutes: null,
  startedAt: null,
  endsAt: null,
  checkInDueAt: null,
  lastCheckInAt: null,
  demoMode: false,
  missedCheckInAt: null,
};

export const SafeWindowProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [safeWindow, setSafeWindow] = useState<SafeWindowState>(initialState);

  const startSafeWindow = (durationMinutes: SafeWindowDuration) => {
    const now = new Date();
    const demoMode = durationMinutes === 0.5;
    const durationMs = durationMinutes * 60 * 1000;
    const endsAt = new Date(now.getTime() + durationMs);
    
    // checkInDueAt: demo mode 15 seconds, normal mode 5 minutes
    const checkInDueMs = demoMode ? 15 * 1000 : 5 * 60 * 1000;
    const checkInDueAt = new Date(now.getTime() + checkInDueMs);

    setSafeWindow({
      status: 'ACTIVE',
      durationMinutes,
      startedAt: now.toISOString(),
      endsAt: endsAt.toISOString(),
      checkInDueAt: checkInDueAt.toISOString(),
      lastCheckInAt: null,
      demoMode,
      missedCheckInAt: null,
    });
  };

  const endSafeWindow = () => {
    setSafeWindow(prev => ({
      ...prev,
      status: 'COMPLETED',
      // Keep startedAt and endsAt for display if useful
    }));
  };

  const markCheckInSafe = () => {
    const now = new Date();
    setSafeWindow(prev => {
      if (prev.status !== 'ACTIVE') return prev;
      
      const checkInDueMs = prev.demoMode ? 15 * 1000 : 5 * 60 * 1000;
      const nextDueAt = new Date(now.getTime() + checkInDueMs);
      return {
        ...prev,
        lastCheckInAt: now.toISOString(),
        checkInDueAt: nextDueAt.toISOString(),
      };
    });
  };

  const markMissedCheckIn = () => {
    setSafeWindow(prev => {
      if (prev.status === 'MISSED_CHECKIN') return prev;
      
      // TODO: After Person A’s AlertContext is merged, create Silent SOS alert here.
      
      return {
        ...prev,
        status: 'MISSED_CHECKIN',
        missedCheckInAt: new Date().toISOString(),
      };
    });
  };

  // Auto-detect missed check-in and window expiry
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (safeWindow.status === 'ACTIVE') {
      interval = setInterval(() => {
        const now = new Date().getTime();
        
        // Check if check-in missed
        if (safeWindow.checkInDueAt && now >= new Date(safeWindow.checkInDueAt).getTime()) {
          markMissedCheckIn();
        } else if (safeWindow.endsAt && now >= new Date(safeWindow.endsAt).getTime()) {
          // Check if window ended
          endSafeWindow();
        }
      }, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [safeWindow.status, safeWindow.endsAt, safeWindow.checkInDueAt]);

  const getRemainingSeconds = () => {
    if (safeWindow.status === 'INACTIVE' || safeWindow.status === 'COMPLETED' || safeWindow.status === 'MISSED_CHECKIN') return 0;
    if (!safeWindow.endsAt) return 0;
    const endsAt = new Date(safeWindow.endsAt).getTime();
    const now = new Date().getTime();
    const diff = Math.floor((endsAt - now) / 1000);
    return diff > 0 ? diff : 0;
  };

  const getCheckInRemainingSeconds = () => {
    if (safeWindow.status === 'INACTIVE' || safeWindow.status === 'COMPLETED' || safeWindow.status === 'MISSED_CHECKIN') return 0;
    if (!safeWindow.checkInDueAt) return 0;
    const dueAt = new Date(safeWindow.checkInDueAt).getTime();
    const now = new Date().getTime();
    const diff = Math.floor((dueAt - now) / 1000);
    return diff > 0 ? diff : 0;
  };

  return (
    <SafeWindowContext.Provider value={{
      safeWindow,
      startSafeWindow,
      endSafeWindow,
      markCheckInSafe,
      markMissedCheckIn,
      getRemainingSeconds,
      getCheckInRemainingSeconds,
    }}>
      {children}
    </SafeWindowContext.Provider>
  );
};

export const useSafeWindow = () => {
  const context = useContext(SafeWindowContext);
  if (!context) {
    throw new Error('useSafeWindow must be used within a SafeWindowProvider');
  }
  return context;
};
