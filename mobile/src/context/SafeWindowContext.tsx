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
import { scheduleLocalNotification, cancelLocalNotification } from '../services/notificationService';
import { supabase } from '../lib/supabaseClient';
import { apiClient } from '../api/client';

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
  const activeNotificationId = useRef<string | null>(null);

  const clearExistingNotification = async () => {
    if (activeNotificationId.current) {
      await cancelLocalNotification(activeNotificationId.current);
      activeNotificationId.current = null;
    }
  };

  const scheduleNextNotification = async (checkInDueAt: string, demoMode: boolean) => {
    await clearExistingNotification();
    const dueTime = new Date(checkInDueAt).getTime();
    const now = new Date().getTime();
    
    // In demo mode, warn 5 seconds before. In normal mode, warn 60 seconds before.
    const warningLeadTimeMs = demoMode ? 5000 : 60000;
    const triggerInMs = (dueTime - now) - warningLeadTimeMs;
    
    if (triggerInMs > 0) {
      const triggerInSecs = Math.floor(triggerInMs / 1000);
      const id = await scheduleLocalNotification(
        'SafeHer Check-In',
        'Your check-in is due soon. Please confirm you are safe.',
        triggerInSecs
      );
      activeNotificationId.current = id;
    }
  };

  useEffect(() => {
    AsyncStorage.getItem('@battery_prompt_shown').then(status => {
      if (status === 'denied') setBatteryOptimizationDenied(true);
    });

    const restoreJourney = async (session: any) => {
      if (!session) return;
      try {
        const response = await apiClient.get('/api/journeys');
        const journeys = response.data;
          // Find first active journey
          const active = journeys.find((j: any) => j.status === 'active');
          if (active) {
            setSafeWindow(prev => ({
              ...prev,
              journeyId: active.id,
              status: 'ACTIVE',
              durationMinutes: active.duration_minutes || null,
              startedAt: active.started_at,
              startLocation: active.start_latitude ? { latitude: active.start_latitude, longitude: active.start_longitude } : null,
              // Other fields might need restoring but we just sync the basic active state for now
            }));
            startBackgroundLocationService();
          }
      } catch (e) {
        console.warn("Could not restore journeys", e);
      }
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      restoreJourney(session);
    });
    
    supabase.auth.onAuthStateChange((_event, session) => {
      restoreJourney(session);
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
    
    // checkInDueAt: demo mode 30 seconds, normal mode 5 minutes
    const checkInDueMs = demoMode ? 30 * 1000 : 5 * 60 * 1000;
    const checkInDueAt = new Date(now.getTime() + checkInDueMs).toISOString();

    let actualStartLoc = startLoc;
    if (!actualStartLoc) {
      try {
        const loc = await getCurrentLocationForAlert();
        if (loc && !loc.permissionDenied) {
          actualStartLoc = { latitude: loc.latitude, longitude: loc.longitude };
        }
      } catch (e) {
        console.warn("Failed to get current location", e);
      }
    }

    let initialRoute: {lat: number, lon: number}[] = [];
    if (actualStartLoc && destLoc) {
      const fetchedRoute = await getRoute(actualStartLoc, destLoc);
      if (fetchedRoute) initialRoute = fetchedRoute;
      else initialRoute = [{lat: actualStartLoc.latitude, lon: actualStartLoc.longitude}, {lat: destLoc.latitude, lon: destLoc.longitude}];
    }

    let journeyId: string | undefined;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const payload = {
          journey_name: "Safe Journey",
          start_label: "Current Location",
          start_latitude: actualStartLoc?.latitude || null,
          start_longitude: actualStartLoc?.longitude || null,
          destination_label: "Destination",
          destination_latitude: destLoc?.latitude || null,
          destination_longitude: destLoc?.longitude || null,
          check_in_interval_minutes: demoMode ? 0.5 : 5,
          expected_duration_minutes: durationMinutes
        };
        const response = await apiClient.post('/api/journeys', payload);
        journeyId = response.data.id;
      }
    } catch (e: any) {
      console.warn("Could not sync journey start to backend", e);
      const errorMessage = e.customMessage || "Failed to sync journey with server. Please ensure your profile is complete.";
      throw new Error(errorMessage);
    }

    setSafeWindow({
      journeyId,
      status: 'ACTIVE',
      durationMinutes,
      startedAt: now.toISOString(),
      endsAt: endsAt.toISOString(),
      checkInDueAt,
      lastCheckInAt: null,
      demoMode,
      missedCheckInAt: null,
      startLocation: actualStartLoc || null,
      destinationLocation: destLoc || null,
      routePoints: initialRoute,
      routeDeviationWarningAt: null,
      routeDeviationDetected: false,
    });
    setDistanceToDestination(null);

    // Start background polling service
    startBackgroundLocationService();
    scheduleNextNotification(checkInDueAt, demoMode);
  };

  const endSafeWindow = async () => {
    clearExistingNotification();
    
    // Sync with backend
    if (safeWindow.journeyId) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          await apiClient.post(`/api/journeys/${safeWindow.journeyId}/complete`);
        }
      } catch (e) {
        console.warn("Could not sync journey complete to backend", e);
      }
    }

    setSafeWindow(prev => ({
      ...prev,
      status: 'COMPLETED',
    }));
    stopBackgroundLocationService();
  };

  const markCheckInSafe = async () => {
    const now = new Date();
    setSafeWindow(prev => {
      if (prev.status !== 'ACTIVE') return prev;
      
      const checkInDueMs = prev.demoMode ? 30 * 1000 : 5 * 60 * 1000;
      const nextDueAt = new Date(now.getTime() + checkInDueMs).toISOString();
      
      scheduleNextNotification(nextDueAt, prev.demoMode || false);

      return {
        ...prev,
        lastCheckInAt: now.toISOString(),
        checkInDueAt: nextDueAt,
        routeDeviationDetected: false, // Reset deviation on manual check-in
      };
    });
  };

  const markMissedCheckIn = async () => {
    setSafeWindow(prev => {
      if (prev.status === 'MISSED_CHECKIN') return prev;
      
      if (!missedAlertCreated.current) {
        missedAlertCreated.current = true;
        clearExistingNotification();
        
        // Sync with backend to actually trigger SMS
        if (prev.journeyId) {
          try {
            supabase.auth.getSession().then(({ data: { session } }: any) => {
              if (session) {
                apiClient.post(`/api/journeys/${prev.journeyId}/missed-checkin`).catch(err => {
                  console.warn("Could not sync missed checkin", err);
                });
              }
            });
          } catch (e) {
            console.warn("Could not sync missed checkin to backend", e);
          }
        }
        
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
          // Check if window ended gracefully without missing check-ins
          endSafeWindow();
        }

        // Route monitoring
        if (safeWindow.routePoints && safeWindow.routePoints.length > 0 && safeWindow.destinationLocation && !safeWindow.routeDeviationDetected) {
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
                    // Start 60s grace period and schedule notification
                    const promptTime = new Date(now + 60 * 1000).toISOString();
                    scheduleNextNotification(promptTime, prev.demoMode || false);
                    return { ...prev, routeDeviationWarningAt: new Date().toISOString(), checkInDueAt: promptTime };
                  }
                  
                  // If warning started, check if 60s elapsed
                  const warningTime = new Date(prev.routeDeviationWarningAt).getTime();
                  if (now - warningTime >= 60000) {
                    // Time elapsed, it will be caught by the missed check-in logic
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
             if (__DEV__) console.log("SafeWindow location check failed", err);
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

