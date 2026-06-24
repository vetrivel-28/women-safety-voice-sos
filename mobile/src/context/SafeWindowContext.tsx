import React, { createContext, useState, useContext, useEffect, useRef } from 'react';
import { SafeWindowState, SafeWindowDuration } from '../types';
import { useAlert } from './AlertContext';
import { getCurrentLocationForAlert } from '../utils/location';
import { distanceBetweenPointsMeters, isRouteDeviation } from '../utils/geoUtils';
import { useContacts } from './ContactsContext';
import { getRoute } from '../services/geocodingService';
import { startBackgroundLocationService, stopBackgroundLocationService } from '../services/backgroundLocation';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { checkIsExempt, requestExemption } from '../modules/BatteryOptimization';

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
  resumeRoute: () => void;
  cancelDeviationWarning: () => void;
  batteryOptimizationDenied: boolean;
  openBatterySettings: () => void;
  checkAndPromptBatteryExemption: () => Promise<void>;
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
  routePoints: [],
  routeDeviationWarningAt: null,
  routeDeviationDetected: false,
};

export const SafeWindowProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [safeWindow, setSafeWindow] = useState<SafeWindowState>(initialState);
  const [distanceToDestination, setDistanceToDestination] = useState<number | null>(null);
  const { createAlert } = useAlert();
  const { getPrimaryContact } = useContacts();
  const missedAlertCreated = useRef(false);
  const deviationAlertCreated = useRef(false);
  const [batteryOptimizationDenied, setBatteryOptimizationDenied] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem('@battery_prompt_shown').then(status => {
      if (status === 'denied') setBatteryOptimizationDenied(true);
    });
  }, []);

  const openBatterySettings = async () => {
    await requestExemption();
    // Optimistically assume they changed it, or at least re-evaluate next time
    await AsyncStorage.removeItem('@battery_prompt_shown');
    setBatteryOptimizationDenied(false);
  };

  const checkAndPromptBatteryExemption = async () => {
    try {
      const isExempt = await checkIsExempt();
      if (!isExempt) {
        const prompted = await AsyncStorage.getItem('@battery_prompt_shown');
        if (!prompted) {
          Alert.alert(
            'Background Reliability',
            'For your safety, SafeHer needs permission to ignore battery optimizations so we can track your journey even when the screen is off.',
            [
              {
                text: 'Not Now',
                style: 'cancel',
                onPress: () => {
                   AsyncStorage.setItem('@battery_prompt_shown', 'denied');
                   setBatteryOptimizationDenied(true);
                }
              },
              {
                text: 'Allow',
                onPress: async () => {
                   await AsyncStorage.setItem('@battery_prompt_shown', 'granted');
                   await requestExemption();
                }
              }
            ]
          );
        }
      }
    } catch (e) {
      console.warn('Battery optimization check failed', e);
    }
  };

  const startSafeWindow = async (
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
    
    const checkInDueMs = demoMode ? 15 * 1000 : 5 * 60 * 1000;
    const checkInDueAt = new Date(now.getTime() + checkInDueMs);

    let initialRoute: {lat: number, lon: number}[] = [];
    if (startLoc && destLoc) {
      const fetchedRoute = await getRoute(startLoc, destLoc);
      if (fetchedRoute) initialRoute = fetchedRoute;
      else initialRoute = [{lat: startLoc.latitude, lon: startLoc.longitude}, {lat: destLoc.latitude, lon: destLoc.longitude}];
    }

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
      routePoints: initialRoute,
      routeDeviationWarningAt: null,
      routeDeviationDetected: false,
    });
    setDistanceToDestination(null);

    // Start background polling service
    startBackgroundLocationService();
  };

  const endSafeWindow = () => {
    setSafeWindow(prev => ({
      ...prev,
      status: 'COMPLETED',
    }));
    stopBackgroundLocationService();
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
      stopBackgroundLocationService();
      return {
        ...prev,
        status: 'MISSED_CHECKIN',
        missedCheckInAt: new Date().toISOString(),
      };
    });
  };

  const resumeRoute = async () => {
    if (!safeWindow.destinationLocation) return;
    try {
      const currentLoc = await getCurrentLocationForAlert();
      if (currentLoc && !currentLoc.permissionDenied) {
        const start = { latitude: currentLoc.latitude, longitude: currentLoc.longitude };
        const fetchedRoute = await getRoute(start, safeWindow.destinationLocation);
        if (fetchedRoute) {
          setSafeWindow(prev => ({
            ...prev,
            routePoints: fetchedRoute,
            routeDeviationWarningAt: null,
            routeDeviationDetected: false
          }));
        }
      }
    } catch (e) {
      console.warn("Could not resume route", e);
    }
  };

  const cancelDeviationWarning = () => {
    setSafeWindow(prev => ({
      ...prev,
      routeDeviationWarningAt: null,
      routeDeviationDetected: false
    }));
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (safeWindow.status === 'ACTIVE') {
      interval = setInterval(() => {
        const now = new Date().getTime();
        
        // Missed check-in
        if (safeWindow.checkInDueAt && now >= new Date(safeWindow.checkInDueAt).getTime()) {
          markMissedCheckIn();
        } else if (safeWindow.endsAt && now >= new Date(safeWindow.endsAt).getTime()) {
          endSafeWindow();
        }

        // Route monitoring
        if (safeWindow.routePoints && safeWindow.routePoints.length > 0 && safeWindow.destinationLocation) {
          getCurrentLocationForAlert().then(loc => {
            if (loc && !loc.permissionDenied) {
              const currentLoc = { lat: loc.latitude, lon: loc.longitude };
              const destLoc = { lat: safeWindow.destinationLocation!.latitude, lon: safeWindow.destinationLocation!.longitude };
              
              const distToDest = distanceBetweenPointsMeters(currentLoc.lat, currentLoc.lon, destLoc.lat, destLoc.lon);
              setDistanceToDestination(distToDest);

              if (isRouteDeviation(currentLoc, safeWindow.routePoints!, 300)) {
                setSafeWindow(prev => {
                  if (prev.routeDeviationDetected) return prev;
                  if (!prev.routeDeviationWarningAt) {
                    // Start 60s grace period
                    return { ...prev, routeDeviationWarningAt: new Date().toISOString() };
                  }
                  
                  // If warning started, check if 60s elapsed
                  const warningTime = new Date(prev.routeDeviationWarningAt).getTime();
                  if (now - warningTime >= 60000) {
                    // Trigger alert
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
                    return { ...prev, routeDeviationDetected: true };
                  }
                  return prev;
                });
              } else {
                // Not deviated, clear warning if present
                setSafeWindow(prev => {
                  if (prev.routeDeviationWarningAt && !prev.routeDeviationDetected) {
                    return { ...prev, routeDeviationWarningAt: null };
                  }
                  return prev;
                });
              }
            }
          }).catch(err => {
             console.log("SafeWindow location check failed", err);
          });
        }
      }, 5000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [safeWindow.status, safeWindow.endsAt, safeWindow.checkInDueAt, safeWindow.routePoints, safeWindow.routeDeviationDetected, safeWindow.routeDeviationWarningAt]);

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
      resumeRoute,
      cancelDeviationWarning,
      batteryOptimizationDenied,
      openBatterySettings,
      checkAndPromptBatteryExemption
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
