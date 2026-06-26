import React, { createContext, useState, useContext, useEffect, useRef } from 'react';
import { SafeWindowState, SafeWindowDuration } from '../types';
import { useAlert } from './AlertContext';
import { getCurrentLocationForAlert } from '../utils/location';
import { distanceBetweenPointsMeters, isRouteDeviation } from '../utils/geoUtils';
import { useContacts } from './ContactsContext';
import { getRoute } from '../services/geocodingService';
import { startBackgroundLocationService, stopBackgroundLocationService } from '../services/backgroundLocation';
import { Alert, AppState } from 'react-native';
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
  const missedTriggeredRef = useRef(false);
  const completeInFlightRef = useRef(false);
  const checkInInFlightRef = useRef(false);
  const startInFlightRef = useRef(false);
  const restoreInFlightRef = useRef(false);
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

  const restoreJourney = async (session: any) => {
    if (!session || restoreInFlightRef.current) return;
    restoreInFlightRef.current = true;
    try {
      console.log(`[DEBUG] GET /api/journeys executing for user: ${session.user?.id}`);
      const response = await apiClient.get('/api/journeys');
      const journeys = response.data;
      const active = journeys.find((j: any) => j.status === 'active');
      
      if (active) {
        console.log(`[DEBUG] Restoring journey created by user: ${active.user_id}`);
        // Legacy fallback
        const now = new Date();
        const durationSecs = active.duration_seconds || (active.duration_minutes ? active.duration_minutes * 60 : 1800);
        const startedAt = new Date(active.started_at);
        const endsAtStr = active.ends_at || new Date(startedAt.getTime() + durationSecs * 1000).toISOString();
        const intervalMins = active.check_in_interval_minutes || 5;
        const checkInDueStr = active.check_in_due_at || new Date(startedAt.getTime() + intervalMins * 60000).toISOString();
        
        setSafeWindow(prev => ({
          ...prev,
          journeyId: active.id,
          status: 'ACTIVE',
          durationMinutes: active.duration_minutes || null,
          startedAt: active.started_at,
          endsAt: endsAtStr,
          checkInDueAt: checkInDueStr,
          lastCheckInAt: active.last_check_in_at || active.started_at,
          startLocation: active.start_latitude ? { latitude: active.start_latitude, longitude: active.start_longitude } : null,
        }));
        
        missedTriggeredRef.current = false;
        completeInFlightRef.current = false;
        startBackgroundLocationService();
        
        // Immediately check if already missed while app was closed
        if (now.getTime() >= new Date(checkInDueStr).getTime()) {
           markMissedCheckIn(active.id);
        } else if (now.getTime() >= new Date(endsAtStr).getTime()) {
           endSafeWindow(active.id);
        }

      } else if (Array.isArray(journeys)) {
        setSafeWindow(prev => {
          if (prev.status === 'ACTIVE' && prev.journeyId) {
            console.warn(`[DEV WARNING] GET /api/journeys returned no active journey but we thought we had one.`);
          }
          return initialState;
        });
      }
    } catch (e: any) {
      if (e.response && e.response.status === 401) {
        // Transient 401 -> don't clear state, wait for valid retry
        console.warn("Transient 401 on restore, preserving current state.");
      } else {
        console.warn("Could not restore journeys (request failed/errored), keeping current state", e);
      }
    } finally {
      restoreInFlightRef.current = false;
    }
  };

  useEffect(() => {
    AsyncStorage.getItem('@battery_prompt_shown').then(status => {
      if (status === 'denied') setBatteryOptimizationDenied(true);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      restoreJourney(session);
    });
    
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      restoreJourney(session);
    });
    
    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  const openBatterySettings = async () => {
    await requestExemption();
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
              { text: 'Not Now', style: 'cancel', onPress: () => { AsyncStorage.setItem('@battery_prompt_shown', 'denied'); setBatteryOptimizationDenied(true); } },
              { text: 'Allow', onPress: async () => { await AsyncStorage.setItem('@battery_prompt_shown', 'granted'); await requestExemption(); } }
            ]
          );
        }
      }
    } catch (e) {
      console.warn('Battery optimization check failed', e);
    }
  };

  const startSafeWindow = async (durationMinutes: SafeWindowDuration, startLoc?: {latitude: number, longitude: number}, destLoc?: {latitude: number, longitude: number}) => {
    if (startInFlightRef.current || completeInFlightRef.current || safeWindow.status === 'ACTIVE') {
      throw new Error("Action currently in flight or another journey is already active.");
    }
    startInFlightRef.current = true;
    missedAlertCreated.current = false;
    deviationAlertCreated.current = false;
    missedTriggeredRef.current = false;
    completeInFlightRef.current = false;
    
    const now = new Date();
    const demoMode = durationMinutes === 0.5;

    let actualStartLoc = startLoc;
    if (!actualStartLoc) {
      try {
        const loc = await getCurrentLocationForAlert();
        if (loc && !loc.permissionDenied) {
          actualStartLoc = { latitude: loc.latitude, longitude: loc.longitude };
        }
      } catch (e) { console.warn("Failed to get current location", e); }
    }

    let initialRoute: {lat: number, lon: number}[] = [];
    if (actualStartLoc && destLoc) {
      const fetchedRoute = await getRoute(actualStartLoc, destLoc);
      if (fetchedRoute) initialRoute = fetchedRoute;
      else initialRoute = [{lat: actualStartLoc.latitude, lon: actualStartLoc.longitude}, {lat: destLoc.latitude, lon: destLoc.longitude}];
    }

    let journeyData: any;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw { response: { status: 401 } };
      
      const payload = {
        journey_name: "Safe Journey",
        start_label: "Current Location",
        ...(actualStartLoc && { start_latitude: actualStartLoc.latitude, start_longitude: actualStartLoc.longitude }),
        ...(destLoc ? { destination_label: "Destination", destination_latitude: destLoc.latitude, destination_longitude: destLoc.longitude } : {}),
        ...(demoMode ? {
           duration_seconds: 30,
           duration_minutes: 1,
           check_in_interval_seconds: 30,
           check_in_interval_minutes: 1,
           expected_duration_minutes: 1,
           demo_mode: true
        } : {
           duration_seconds: durationMinutes * 60,
           duration_minutes: durationMinutes,
           check_in_interval_minutes: 5,
           expected_duration_minutes: durationMinutes
        })
      };
      
      console.log(`[DEBUG] POST /api/journeys executing for user: ${session.user?.id}`);
      const response = await apiClient.post('/api/journeys', payload);
      journeyData = response.data;
      console.log(`[DEBUG] POST /api/journeys returned journeyId: ${journeyData.id} assigned to user: ${journeyData.user_id}`);
    } catch (e: any) {
      startInFlightRef.current = false;
      console.warn("Could not sync journey start to backend", e);
      let errorMessage = "Could not start Safe Window. Please try again.";
      
      if (e.response) {
         if (e.response.status === 401) errorMessage = "Session expired. Please login again.";
         else if (e.response.status === 400 || e.response.status === 422) errorMessage = "Invalid journey duration. Please try again.";
         else if (e.response.status === 409) {
             errorMessage = e.response.data?.detail || e.response.data?.message || "You already have an active safe window. End it before starting another.";
             try {
                const getResp = await apiClient.get('/api/journeys');
                const active = getResp.data.find((j: any) => j.status === 'active');
                if (active) {
                    journeyData = active;
                } else {
                    throw new Error(errorMessage);
                }
             } catch (retryErr) {
                throw new Error(errorMessage);
             }
         }
      } else if (e.message?.includes('Network Error') || e.message?.includes('timeout') || e.message?.includes('Network request failed')) {
         errorMessage = "Could not reach backend. Check Wi-Fi/backend.";
         try {
             // In case it was a timeout but succeeded on backend
             const getResp = await apiClient.get('/api/journeys');
             const active = getResp.data.find((j: any) => j.status === 'active');
             if (active) {
                 journeyData = active;
             } else {
                 throw new Error(errorMessage);
             }
         } catch (retryErr) {
             throw new Error(errorMessage);
         }
      } else {
         throw new Error(errorMessage);
      }
      
      if (!journeyData) throw new Error(errorMessage);
    }
    startInFlightRef.current = false;

    setSafeWindow({
      journeyId: journeyData.id,
      status: 'ACTIVE',
      durationMinutes,
      startedAt: journeyData.started_at,
      endsAt: journeyData.ends_at,
      checkInDueAt: journeyData.check_in_due_at,
      lastCheckInAt: journeyData.last_check_in_at,
      demoMode,
      missedCheckInAt: null,
      startLocation: actualStartLoc || null,
      destinationLocation: destLoc || null,
      routePoints: initialRoute,
      routeDeviationWarningAt: null,
      routeDeviationDetected: false,
    });
    setDistanceToDestination(null);

    startBackgroundLocationService();
    scheduleNextNotification(journeyData.check_in_due_at, demoMode);
  };

  const endSafeWindow = async (forceId?: string) => {
    if (completeInFlightRef.current) return;
    completeInFlightRef.current = true;
    
    clearExistingNotification();
    
    const targetId = forceId || safeWindow.journeyId;
    if (targetId) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          const res = await apiClient.post(`/api/journeys/${targetId}/complete`);
        }
      } catch (e) {
        console.warn("Could not sync journey complete to backend", e);
      }
    }
    setSafeWindow(initialState);
    stopBackgroundLocationService();
    completeInFlightRef.current = false;
  };

  const markCheckInSafe = async () => {
    if (checkInInFlightRef.current || safeWindow.status !== 'ACTIVE') return;
    checkInInFlightRef.current = true;
    
    try {
      if (safeWindow.journeyId) {
        const res = await apiClient.post(`/api/journeys/${safeWindow.journeyId}/check-in`);
        const journey = res.data;
        if (journey.status === 'completed' || journey.status === 'missed') {
            setSafeWindow(prev => ({ ...prev, status: journey.status === 'completed' ? 'COMPLETED' : 'MISSED_CHECKIN' }));
            return;
        }
        setSafeWindow(prev => {
          if (prev.status !== 'ACTIVE') return prev;
          scheduleNextNotification(journey.check_in_due_at, prev.demoMode || false);
          return {
            ...prev,
            lastCheckInAt: journey.last_check_in_at,
            checkInDueAt: journey.check_in_due_at,
            routeDeviationDetected: false,
          };
        });
      }
    } catch (e: any) {
      console.warn("Could not check in", e);
      if (e.response && (e.response.status === 404 || e.response.status === 409)) {
          setSafeWindow(prev => ({ ...prev, status: 'COMPLETED' }));
      }
    } finally {
      checkInInFlightRef.current = false;
    }
  };

  const markMissedCheckIn = async (forceId?: string) => {
    if (missedTriggeredRef.current) return;
    missedTriggeredRef.current = true;
    
    clearExistingNotification();
    
    const targetId = forceId || safeWindow.journeyId;
    if (targetId) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          await apiClient.post(`/api/journeys/${targetId}/missed-checkin`);
        }
      } catch (e) {
        console.warn("Could not sync missed checkin to backend", e);
      }
    }
    
    setSafeWindow(prev => {
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
    let timerInterval: NodeJS.Timeout;
    let locationInterval: NodeJS.Timeout;
    
    const checkTimers = () => {
      if (safeWindow.status !== 'ACTIVE') return;
      const now = new Date().getTime();
      
      // Missed check-in
      if (safeWindow.checkInDueAt && now >= new Date(safeWindow.checkInDueAt).getTime()) {
        markMissedCheckIn();
      } else if (safeWindow.endsAt && now >= new Date(safeWindow.endsAt).getTime()) {
        endSafeWindow();
      }
    };

    const checkLocation = () => {
      if (safeWindow.status !== 'ACTIVE') return;
      const now = new Date().getTime();
      
      if (safeWindow.routePoints && safeWindow.routePoints.length > 2 && safeWindow.destinationLocation && !safeWindow.routeDeviationDetected && !safeWindow.demoMode) {
        getCurrentLocationForAlert().then(loc => {
          if (loc && !loc.permissionDenied) {
            const currentLoc = { lat: loc.latitude, lon: loc.longitude };
            const destLoc = { lat: safeWindow.destinationLocation!.latitude, lon: safeWindow.destinationLocation!.longitude };
            
            const distToDest = distanceBetweenPointsMeters(currentLoc.lat, currentLoc.lon, destLoc.lat, destLoc.lon);
            if (distToDest < 100000) { // arbitrary sanity check to hide 496km bugs
               setDistanceToDestination(distToDest);
            } else {
               setDistanceToDestination(null);
            }

            if (isRouteDeviation(currentLoc, safeWindow.routePoints!, 300)) {
              setSafeWindow(prev => {
                if (prev.routeDeviationDetected) return prev;
                if (!prev.routeDeviationWarningAt) {
                  const promptTime = new Date(now + 60 * 1000).toISOString();
                  scheduleNextNotification(promptTime, prev.demoMode || false);
                  return { ...prev, routeDeviationWarningAt: new Date().toISOString(), checkInDueAt: promptTime };
                }
                
                const warningTime = new Date(prev.routeDeviationWarningAt).getTime();
                if (now - warningTime >= 60000) {
                  return { ...prev, routeDeviationDetected: true };
                }
                return prev;
              });
            } else {
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
      } else {
         // If demo mode or no real route, ensure distance is null
         setDistanceToDestination(null);
      }
    };
    
    if (safeWindow.status === 'ACTIVE') {
      timerInterval = setInterval(checkTimers, 1000);
      locationInterval = setInterval(checkLocation, 5000);
    }
    
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (nextAppState === 'active' && safeWindow.status === 'ACTIVE') {
         checkTimers();
      }
    });

    return () => {
      if (timerInterval) clearInterval(timerInterval);
      if (locationInterval) clearInterval(locationInterval);
      subscription.remove();
    };
  }, [safeWindow.status, safeWindow.endsAt, safeWindow.checkInDueAt, safeWindow.routePoints, safeWindow.routeDeviationDetected, safeWindow.routeDeviationWarningAt, safeWindow.demoMode]);

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

