import React, { createContext, useState, useContext, useEffect, useRef } from 'react';
import { SafeWindowState, SafeWindowDuration } from '../types';
import { useAlert } from './AlertContext';
import { getCurrentLocationForAlert } from '../utils/location';
import { distanceBetweenPointsMeters, distancePointToSegmentMeters, isRouteDeviation } from '../utils/geoUtils';
import { useContacts } from './ContactsContext';

interface SafeWindowContextType {
  safeWindow: SafeWindowState;
  startSafeWindow: (
    durationMinutes: SafeWindowDuration, 
    startLoc?: {latitude: number, longitude: number},
    destLoc?: {latitude: number, longitude: number}
  ) => void;
  endSafeWindow: () => void;
  markCheckInSafe: () => void;
  markMissedCheckIn: () => void;
  getRemainingSeconds: () => number;
  getCheckInRemainingSeconds: () => number;
  distanceToDestination?: number | null;
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
  startLocation: null,
  destinationLocation: null,
  routeDeviationDetected: false,
};

export const SafeWindowProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [safeWindow, setSafeWindow] = useState<SafeWindowState>(initialState);
  const [distanceToDestination, setDistanceToDestination] = useState<number | null>(null);
  const { createAlert } = useAlert();
  const { getPrimaryContact } = useContacts();
  const missedAlertCreated = useRef(false);
  const deviationAlertCreated = useRef(false);

  const startSafeWindow = (
    durationMinutes: SafeWindowDuration,
    startLoc?: {latitude: number, longitude: number},
    destLoc?: {latitude: number, longitude: number}
  ) => {
    missedAlertCreated.current = false;
    deviationAlertCreated.current = false;
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
      startLocation: startLoc || null,
      destinationLocation: destLoc || null,
      routeDeviationDetected: false,
    });
    setDistanceToDestination(null);
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
      
      if (!missedAlertCreated.current) {
        missedAlertCreated.current = true;
        
        const isJourney = prev.startLocation && prev.destinationLocation;
        const triggerType = isJourney ? 'JOURNEY_MISSED_CHECKIN' : 'DEAD_MAN_MISSED';
        const primary = getPrimaryContact();
        
        getCurrentLocationForAlert().then(locationData => {
          createAlert({
            triggerType,
            status: 'ACTIVE',
            visibleMessage: isJourney ? 'Journey Mode check-in missed' : 'Check-In Timer expired',
            cancelMethod: 'NONE',
            location: locationData && !locationData.permissionDenied ? locationData : undefined,
            guardian_name: primary?.name,
            guardian_phone: primary?.phone,
            guardian_email: primary?.email
          } as any);
        }).catch(() => {
          createAlert({
            triggerType,
            status: 'ACTIVE',
            visibleMessage: isJourney ? 'Journey Mode check-in missed' : 'Check-In Timer expired',
            cancelMethod: 'NONE',
            guardian_name: primary?.name,
            guardian_phone: primary?.phone,
            guardian_email: primary?.email
          } as any);
        });
      }
      
      return {
        ...prev,
        status: 'MISSED_CHECKIN',
        missedCheckInAt: new Date().toISOString(),
      };
    });
  };

  // Auto-detect missed check-in, window expiry, and route deviation
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

        // Route monitoring
        if (safeWindow.startLocation && safeWindow.destinationLocation) {
          getCurrentLocationForAlert().then(loc => {
            if (loc && !loc.permissionDenied) {
              const currentLoc = { lat: loc.latitude, lon: loc.longitude };
              const startLoc = { lat: safeWindow.startLocation!.latitude, lon: safeWindow.startLocation!.longitude };
              const destLoc = { lat: safeWindow.destinationLocation!.latitude, lon: safeWindow.destinationLocation!.longitude };
              
              const distToDest = distanceBetweenPointsMeters(currentLoc.lat, currentLoc.lon, destLoc.lat, destLoc.lon);
              setDistanceToDestination(distToDest);

              if (isRouteDeviation(currentLoc, startLoc, destLoc, 300) && !safeWindow.routeDeviationDetected) {
                // Route deviation detected! Prompt check-in.
                setSafeWindow(prev => {
                  if (prev.routeDeviationDetected) return prev;
                  // Force an immediate check-in
                  const promptTime = new Date(now + 30 * 1000).toISOString();
                  return { ...prev, routeDeviationDetected: true, checkInDueAt: promptTime };
                });
                
                if (!deviationAlertCreated.current) {
                  deviationAlertCreated.current = true;
                  const primary = getPrimaryContact();
                  createAlert({
                    triggerType: 'ROUTE_DEVIATION',
                    status: 'ACTIVE',
                    visibleMessage: 'Route deviation detected',
                    cancelMethod: 'NONE',
                    location: loc,
                    guardian_name: primary?.name,
                    guardian_phone: primary?.phone,
                    guardian_email: primary?.email
                  } as any);
                }
              }
            }
          }).catch(err => {
             console.log("SafeWindow location check failed", err);
          });
        }
      }, 5000); // Check every 5 seconds for demo responsiveness
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [safeWindow.status, safeWindow.endsAt, safeWindow.checkInDueAt, safeWindow.startLocation, safeWindow.destinationLocation, safeWindow.routeDeviationDetected]);

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
      distanceToDestination,
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
