import React, { createContext, useState, useContext, useEffect, useRef } from 'react';
import { SafeWindowState, SafeWindowDuration, TrustedPlace } from '../types';
import { useAlert } from './AlertContext';
import { useNotifications } from './NotificationContext';
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
    checkInMinutes: number,
    startLoc?: {latitude: number, longitude: number, address?: string, placeId?: string, provider?: string},
    destLoc?: {latitude: number, longitude: number, address?: string, placeId?: string, provider?: string},
    trustedPlace?: TrustedPlace | null,
  ) => Promise<void>;
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
  isStartingJourney: boolean;
  showArrivalModal: boolean;
  closeArrivalModal: () => void;
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
  const { fetchNotifications } = useNotifications();
  const { getPrimaryContact } = useContacts();
  const missedAlertCreated = useRef(false);
  const deviationAlertCreated = useRef(false);
  const missedTriggeredRef = useRef(false);
  const completeInFlightRef = useRef(false);
  const checkInInFlightRef = useRef(false);
  const startInFlightRef = useRef(false);
  const restoreInFlightRef = useRef(false);
  const [batteryOptimizationDenied, setBatteryOptimizationDenied] = useState(false);
  const [isStartingJourney, setIsStartingJourney] = useState(false);
  const [showArrivalModal, setShowArrivalModal] = useState(false);
  const [arrivalModalJourneyId, setArrivalModalJourneyId] = useState<string | null>(null);
  const activeNotificationId = useRef<string | null>(null);
  const appStateRef = useRef(AppState.currentState);
  
  // Arrival POST ref guards to prevent duplicate calls
  const arrivalPostInFlightJourneyIdRef = useRef<string | null>(null);
  const arrivalHandledJourneyIdRef = useRef<string | null>(null);
  const arrivalModalShownJourneyIdRef = useRef<string | null>(null);
  
  // Location Sync Refs
  const lastBackendSyncRef = useRef<number>(0);
  const lastSyncedLocRef = useRef<{lat: number, lon: number} | null>(null);
  const unsentLocRef = useRef<{lat: number, lon: number, accuracy?: number, captured_at?: string, provider?: string} | null>(null);
  const isSyncingLocationRef = useRef(false);

  const syncFamilyLocation = async (
    coords: { latitude: number; longitude: number; accuracy?: number },
    source: string
  ) => {
    try {
      await apiClient.put('/api/family/me/location', {
        latitude: coords.latitude,
        longitude: coords.longitude,
        accuracy: coords.accuracy,
        source,
      });
    } catch (e) {
      // Non-fatal: user may not be in an approved family, or request failed.
    }
  };

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
          startLocation: active.start_latitude ? { latitude: active.start_latitude, longitude: active.start_longitude, address: active.start_address } : null,
          destinationLocation: active.destination_latitude ? { latitude: active.destination_latitude, longitude: active.destination_longitude, address: active.destination_address } : null,
          distance_km: active.distance_km,
          estimated_duration_minutes: active.estimated_duration_minutes,
          estimated_arrival_at: active.estimated_arrival_at,
          route_status: active.route_status,
          // Trusted place restore
          trustedPlaceId: active.trusted_place_id || null,
          destinationName: active.destination_name || null,
          destinationRadiusMeters: active.destination_radius_meters || 100,
          notifyGuardiansOnArrival: active.notify_guardians_on_arrival ?? true,
          severity: active.severity || 'NORMAL',
          escalatedAt: active.escalated_at || null,
          escalatedReason: active.escalated_reason || null,
          reachedTrustedPlace: false,
        }));
        
        missedTriggeredRef.current = false;
        completeInFlightRef.current = false;
        // Background service is now managed by AppState listener
        
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
    
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      restoreJourney(session);
    });

    // Track app state changes to manage background service
    const appStateSubscription = AppState.addEventListener('change', nextAppState => {
      appStateRef.current = nextAppState;
      
      // Only start background service when app goes to background and safe window is active
      if (nextAppState === 'background' && safeWindow.status === 'ACTIVE') {
        startBackgroundLocationService('app_background');
      }
      // Stop background service when app comes to foreground (JS polling handles it)
      else if (nextAppState === 'active') {
        stopBackgroundLocationService('app_foreground');
      }
    });
    
    return () => {
      authListener.subscription.unsubscribe();
      appStateSubscription.remove();
    };
  }, [safeWindow.status]);

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

  const startSafeWindow = async (durationMinutes: SafeWindowDuration, checkInMinutes: number, startLoc?: {latitude: number, longitude: number, address?: string, placeId?: string, provider?: string}, destLoc?: {latitude: number, longitude: number, address?: string, placeId?: string, provider?: string}, trustedPlace?: TrustedPlace | null) => {
    if (startInFlightRef.current || completeInFlightRef.current || safeWindow.status === 'ACTIVE') {
      throw new Error("Action currently in flight or another journey is already active.");
    }
    startInFlightRef.current = true;
    setIsStartingJourney(true);
    missedAlertCreated.current = false;
    deviationAlertCreated.current = false;
    missedTriggeredRef.current = false;
    completeInFlightRef.current = false;
    
    try {
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
      if (actualStartLoc && actualStartLoc.latitude && actualStartLoc.longitude && destLoc && destLoc.latitude && destLoc.longitude) {
        initialRoute = [{lat: actualStartLoc.latitude, lon: actualStartLoc.longitude}, {lat: destLoc.latitude, lon: destLoc.longitude}];
        // Async route fetch
        getRoute(actualStartLoc, destLoc).then(fetchedRoute => {
          if (fetchedRoute) {
            setSafeWindow(prev => prev.status === 'ACTIVE' ? { ...prev, routePoints: fetchedRoute } : prev);
          }
        }).catch(() => {});
      }

      let journeyData: any;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw { response: { status: 401 } };
        
        const payload = {
          journey_name: "Safe Journey",
          start_label: "Current Location",
          ...(actualStartLoc ? { start_latitude: actualStartLoc.latitude, start_longitude: actualStartLoc.longitude, start_address: actualStartLoc.address, start_place_id: (actualStartLoc as any).placeId, location_provider: (actualStartLoc as any).provider || (destLoc as any)?.provider } : {}),
          ...(destLoc ? { destination_label: "Destination", destination_latitude: destLoc.latitude, destination_longitude: destLoc.longitude, destination_address: destLoc.address, destination_place_id: (destLoc as any).placeId, location_provider: (destLoc as any).provider || (actualStartLoc as any)?.provider } : {}),
          // Trusted place integration
          ...(trustedPlace ? {
            trusted_place_id: trustedPlace.id,
            destination_name: trustedPlace.name,
            destination_latitude: trustedPlace.latitude,
            destination_longitude: trustedPlace.longitude,
            destination_address: trustedPlace.address || destLoc?.address,
            destination_radius_meters: trustedPlace.radius_meters,
            notify_guardians_on_arrival: trustedPlace.notify_guardians_on_arrival,
          } : {}),
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
             check_in_interval_minutes: checkInMinutes,
             expected_duration_minutes: durationMinutes
          })
        };
        
        console.log(`[DEBUG] POST /api/journeys executing for user: ${session.user?.id}`);
        const response = await apiClient.post('/api/journeys', payload);
        journeyData = response.data;
        console.log(`[DEBUG] POST /api/journeys returned journeyId: ${journeyData.id} assigned to user: ${journeyData.user_id}`);
      } catch (e: any) {
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

      // Reset arrival refs for new journey
      console.log('[TRUSTED PLACE ARRIVAL] refs_reset_for_new_journey journeyId =', journeyData.id);
      arrivalPostInFlightJourneyIdRef.current = null;
      arrivalHandledJourneyIdRef.current = null;
      arrivalModalShownJourneyIdRef.current = null;

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
        destinationLocation: trustedPlace
          ? { latitude: trustedPlace.latitude, longitude: trustedPlace.longitude, address: trustedPlace.address || undefined }
          : destLoc || null,
        routePoints: initialRoute,
        routeDeviationWarningAt: null,
        routeDeviationDetected: false,
        distance_km: journeyData.distance_km,
        estimated_duration_minutes: journeyData.estimated_duration_minutes,
        estimated_arrival_at: journeyData.estimated_arrival_at,
        route_status: journeyData.route_status,
        // Trusted place
        trustedPlaceId: trustedPlace?.id || null,
        destinationName: trustedPlace?.name || journeyData.destination_name || null,
        destinationRadiusMeters: trustedPlace?.radius_meters || journeyData.destination_radius_meters || 100,
        notifyGuardiansOnArrival: trustedPlace?.notify_guardians_on_arrival ?? true,
        severity: 'NORMAL',
        reachedTrustedPlace: false,
      });

      // Background service is now managed by AppState listener
      await scheduleNextNotification(journeyData.check_in_due_at, demoMode);
      
      if (actualStartLoc && typeof actualStartLoc.latitude === 'number' && typeof actualStartLoc.longitude === 'number') {
        await syncFamilyLocation({
          latitude: actualStartLoc.latitude,
          longitude: actualStartLoc.longitude,
        }, 'SAFE_WINDOW');
      }
    } finally {
      startInFlightRef.current = false;
      setIsStartingJourney(false);
    }
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
          await apiClient.post(`/api/journeys/${targetId}/complete`);
          
          if (lastSyncedLocRef.current) {
            await syncFamilyLocation({
              latitude: lastSyncedLocRef.current.lat,
              longitude: lastSyncedLocRef.current.lon,
            }, 'SAFE_WINDOW_ENDED');
          } else {
            try {
              const loc = await getCurrentLocationForAlert(true);
              if (loc && !loc.permissionDenied) {
                await syncFamilyLocation({
                  latitude: loc.latitude,
                  longitude: loc.longitude,
                  accuracy: loc.accuracy || undefined,
                }, 'SAFE_WINDOW_ENDED');
              }
            } catch (e) {}
          }
        }
      } catch (e) {
        console.warn("Could not sync journey complete to backend", e);
      }
    }
    setSafeWindow(initialState);
    stopBackgroundLocationService('cleanup');
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
            if (journey.status === 'completed') {
              stopBackgroundLocationService('cleanup');
            }
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
          stopBackgroundLocationService('cleanup');
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
          
          if (lastSyncedLocRef.current) {
            await syncFamilyLocation({
              latitude: lastSyncedLocRef.current.lat,
              longitude: lastSyncedLocRef.current.lon,
            }, 'SAFE_WINDOW_MISSED_CHECKIN');
          } else {
            try {
              const loc = await getCurrentLocationForAlert(true);
              if (loc && !loc.permissionDenied) {
                await syncFamilyLocation({
                  latitude: loc.latitude,
                  longitude: loc.longitude,
                  accuracy: loc.accuracy || undefined,
                }, 'SAFE_WINDOW_MISSED_CHECKIN');
              }
            } catch (e) {}
          }
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
      
      // Do NOT stop background location service for missed check-in
      // Journey continues
      
      const intervalMins = prev.durationMinutes ? 5 : 5; // Default 5 if unknown
      const nextDue = new Date(new Date().getTime() + intervalMins * 60000).toISOString();
      
      // Allow next checkin to trigger again if they miss it again
      setTimeout(() => { missedTriggeredRef.current = false; }, 10000);

      return {
        ...prev,
        status: 'ACTIVE',
        checkInDueAt: nextDue,
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
      
      getCurrentLocationForAlert().then(async loc => {
        if (!loc || loc.permissionDenied) return;
        const currentLoc = { lat: loc.latitude, lon: loc.longitude };
        
        // 1. Sync backend tracking (every 20s OR > 25m movement)
        if (safeWindow.journeyId && !isSyncingLocationRef.current) {
          const timeSinceSync = now - lastBackendSyncRef.current;
          let shouldSync = false;
          
          if (timeSinceSync >= 20000 || unsentLocRef.current) {
            shouldSync = true;
          } else if (lastSyncedLocRef.current) {
            const distSinceSync = distanceBetweenPointsMeters(
              currentLoc.lat, currentLoc.lon,
              lastSyncedLocRef.current.lat, lastSyncedLocRef.current.lon
            );
            if (distSinceSync > 25) shouldSync = true;
          }

          if (shouldSync) {
            isSyncingLocationRef.current = true;
            const payload = unsentLocRef.current ? {
              latitude: unsentLocRef.current.lat,
              longitude: unsentLocRef.current.lon,
              accuracy: unsentLocRef.current.accuracy,
              captured_at: unsentLocRef.current.captured_at,
              provider: unsentLocRef.current.provider
            } : {
              latitude: currentLoc.lat,
              longitude: currentLoc.lon,
              accuracy: loc.accuracy,
              captured_at: loc.captured_at,
              provider: loc.provider
            };

            try {
              await apiClient.patch(`/api/journeys/${safeWindow.journeyId}/location`, payload);
              lastBackendSyncRef.current = now;
              lastSyncedLocRef.current = currentLoc;
              unsentLocRef.current = null;
              
              await syncFamilyLocation({
                latitude: payload.latitude,
                longitude: payload.longitude,
                accuracy: payload.accuracy,
              }, 'SAFE_WINDOW');
            } catch (e) {
              console.warn("Could not sync location to backend (offline/network issue)", e);
              if (!unsentLocRef.current) {
                unsentLocRef.current = { lat: currentLoc.lat, lon: currentLoc.lon, accuracy: loc.accuracy, captured_at: loc.captured_at, provider: loc.provider };
              }
            } finally {
              isSyncingLocationRef.current = false;
            }
          }
        }

        // 2. Distance check + trusted-place auto-complete
        if (safeWindow.destinationLocation && !safeWindow.demoMode && 
            typeof safeWindow.destinationLocation.latitude === 'number' && 
            typeof safeWindow.destinationLocation.longitude === 'number' &&
            typeof currentLoc.lat === 'number' && typeof currentLoc.lon === 'number') {
          const destLoc = { lat: safeWindow.destinationLocation.latitude, lon: safeWindow.destinationLocation.longitude };
          const distToDest = distanceBetweenPointsMeters(currentLoc.lat, currentLoc.lon, destLoc.lat, destLoc.lon);
          setDistanceToDestination(distToDest);

          // Trusted place auto-complete: enter radius → complete journey
          const radius = safeWindow.destinationRadiusMeters || 100;
          const accuracyOk = !loc.accuracy || loc.accuracy <= 100;
          
          console.log('[GEOFENCE REGISTERED] trustedPlaceId =', safeWindow.trustedPlaceId);
          console.log('[GEOFENCE REGISTERED] destinationRadiusMeters =', radius);
          console.log('[GEOFENCE REGISTERED] calculatedDistanceMeters =', distToDest);
          
          if (
            safeWindow.trustedPlaceId &&
            safeWindow.journeyId &&
            distToDest <= radius &&
            accuracyOk
          ) {
            const journeyId = safeWindow.journeyId;
            console.log('[GEOFENCE ENTER] distance =', distToDest, 'radius =', radius);
            console.log('[TRUSTED PLACE ARRIVAL] trustedPlaceId =', safeWindow.trustedPlaceId);
            
            // Ref-based duplicate prevention (synchronous, before await)
            if (arrivalHandledJourneyIdRef.current === journeyId) {
              console.log('[TRUSTED PLACE ARRIVAL] duplicate_skipped journeyId =', journeyId, 'reason = already_handled');
              return;
            }
            if (arrivalPostInFlightJourneyIdRef.current === journeyId) {
              console.log('[TRUSTED PLACE ARRIVAL] duplicate_skipped journeyId =', journeyId, 'reason = in_flight');
              return;
            }
            
            // Set in-flight ref synchronously before API call
            arrivalPostInFlightJourneyIdRef.current = journeyId;
            console.log('[TRUSTED PLACE ARRIVAL] post_started journeyId =', journeyId);
            
            // Mark locally to prevent UI flicker (non-critical guard)
            setSafeWindow(prev => ({ ...prev, reachedTrustedPlace: true }));
            setArrivalModalJourneyId(journeyId);
            
            try {
              await apiClient.post(`/api/journeys/${journeyId}/reached-trusted-place`);
              console.log('[TRUSTED PLACE ARRIVAL] post_success journeyId =', journeyId);
              
              // Mark as handled only on success
              arrivalHandledJourneyIdRef.current = journeyId;
              
              // Refresh notifications to show new arrival notification
              fetchNotifications();
              
              // Show arrival modal only once per journey
              if (arrivalModalShownJourneyIdRef.current !== journeyId) {
                console.log('[TRUSTED PLACE ARRIVAL MODAL] shown journeyId =', journeyId);
                arrivalModalShownJourneyIdRef.current = journeyId;
                setShowArrivalModal(true);
              }
            } catch (e) {
              console.warn('[SafeWindow] reached-trusted-place API call failed (non-fatal)', e);
              // Clear in-flight ref on failure to allow retry
              arrivalPostInFlightJourneyIdRef.current = null;
            }
            // Don't clear state yet - wait for user to close modal
            return;
          }
        } else {
          setDistanceToDestination(null);
        }

        // 3. Route deviation check
        if (safeWindow.routePoints && safeWindow.routePoints.length > 2 && safeWindow.destinationLocation && !safeWindow.routeDeviationDetected && !safeWindow.demoMode) {
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
        } else {
           setDistanceToDestination(null);
        }
      }).catch(err => {
         if (__DEV__) console.log("SafeWindow location check failed", err);
      });
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

  const closeArrivalModal = () => {
    const journeyId = arrivalModalShownJourneyIdRef.current;
    console.log('[TRUSTED PLACE ARRIVAL MODAL] closed journeyId =', journeyId);
    setShowArrivalModal(false);
    setArrivalModalJourneyId(null);
    // Clear local state after user closes modal
    clearExistingNotification();
    setSafeWindow(initialState);
    stopBackgroundLocationService('cleanup');
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
      checkAndPromptBatteryExemption,
      isStartingJourney,
      showArrivalModal,
      closeArrivalModal
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

