import React, { createContext, useState, useContext, useEffect, useRef } from 'react';
import { SafeWindowState, SafeWindowDuration } from '../types';

let AlertContextRef: any = null;
try {
  const module = require('./AlertContext');
  if (module && module.AlertContext) { // Need to export AlertContext if not already exported... Wait, I didn't export AlertContext.
    // If I didn't export AlertContext, I can't use useContext. 
    // Wait, in my AlertContext.tsx I did: `const AlertContext = createContext(...)` and it's not exported.
    // So I can't use useContext(AlertContext).
    // I HAVE to use `useAlert()`.
  }
} catch(e) {}

let useAlertHook: any = null;
try {
  const module = require('./AlertContext');
  if (module && module.useAlert) {
    useAlertHook = module.useAlert;
  }
} catch(e) {}

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
  const alertedMissedRef = useRef(false);

  let alertCtx: any = null;
  try {
    if (useAlertHook) {
      alertCtx = useAlertHook();
    }
  } catch (e) {
    // Threw error because provider is missing
    alertCtx = null;
  }

  const startSafeWindow = (durationMinutes: SafeWindowDuration) => {
    const now = new Date();
    const demoMode = durationMinutes === 0.5;
    const durationMs = durationMinutes * 60 * 1000;
    const endsAt = new Date(now.getTime() + durationMs);
    
    // checkInDueAt: demo mode 15 seconds, normal mode 5 minutes
    const checkInDueMs = demoMode ? 15 * 1000 : 5 * 60 * 1000;
    const checkInDueAt = new Date(now.getTime() + checkInDueMs);

    alertedMissedRef.current = false; // reset ref

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
      endsAt: prev.endsAt || new Date().toISOString(),
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
      return {
        ...prev,
        status: 'MISSED_CHECKIN',
        missedCheckInAt: new Date().toISOString(),
      };
    });
  };

  const triggerSilentSOS = () => {
    if (!alertCtx) return;
    if (alertedMissedRef.current) return;
    
    alertedMissedRef.current = true;
    if (alertCtx.createAlert) {
      alertCtx.createAlert('SILENT_SOS', 'ACTIVE', 'Silent SOS triggered by missed check-in', 'NONE');
    }
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (safeWindow.status === 'ACTIVE') {
      interval = setInterval(() => {
        const now = new Date().getTime();
        
        // Check if window ended
        if (safeWindow.endsAt && now >= new Date(safeWindow.endsAt).getTime()) {
          endSafeWindow();
          return;
        }

        // Check if check-in missed
        if (safeWindow.checkInDueAt && now >= new Date(safeWindow.checkInDueAt).getTime()) {
          markMissedCheckIn();
        }
      }, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [safeWindow.status, safeWindow.endsAt, safeWindow.checkInDueAt]);

  // Separate effect to trigger SOS so we don't put it directly in the setInterval,
  // making it cleaner and easier to guarantee it only fires once.
  useEffect(() => {
    if (safeWindow.status === 'MISSED_CHECKIN' && !alertedMissedRef.current) {
      triggerSilentSOS();
    }
  }, [safeWindow.status, alertCtx]);

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
