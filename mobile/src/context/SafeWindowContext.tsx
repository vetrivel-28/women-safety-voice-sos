import React, { createContext, useState, useContext, useEffect, useRef } from 'react';
import { SafeWindowState, SafeWindowDuration, TrustedPlace } from '../types';
import { useAlert } from './AlertContext';
import { getCurrentLocationForAlert } from '../utils/location';
import * as Location from 'expo-location';
import { distanceBetweenPointsMeters, isRouteDeviation } from '../utils/geoUtils';
import { useContacts } from './ContactsContext';
import { getRoute } from '../services/geocodingService';
import { Alert, AppState, NativeModules, NativeEventEmitter, PermissionsAndroid, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { checkIsExempt, requestExemption } from '../modules/BatteryOptimization';
import { scheduleLocalNotification, cancelLocalNotification } from '../services/notificationService';
import { supabase } from '../lib/supabaseClient';
import { apiClient } from '../api/client';
import { locationSharingEmitter, startSafeWindowLocation, stopSafeWindowLocation } from '../modules/LocationSharingModule';

const { SafeHerAudioModule } = NativeModules;
const audioEmitter = SafeHerAudioModule ? new NativeEventEmitter(SafeHerAudioModule) : null;

interface SafeWindowContextType {
  safeWindow: SafeWindowState;
  startSafeWindow: (
    durationMinutes: SafeWindowDuration,
    checkInMinutes: number,
    startLoc?: { latitude: number, longitude: number, address?: string, placeId?: string, provider?: string },
    destLoc?: { latitude: number, longitude: number, address?: string, placeId?: string, provider?: string },
    trustedPlace?: TrustedPlace | null
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
  isStartingJourney: boolean;
  showArrivalModal: boolean;
  closeArrivalModal: () => void;
  currentLocation: { lat: number; lon: number } | null;
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
  const [isStartingJourney, setIsStartingJourney] = useState(false);
  const [showArrivalModal, setShowArrivalModal] = useState(false);
  const [distanceToDestination, setDistanceToDestination] = useState<number | null>(null);
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lon: number } | null>(null);

  const safeWindowRef = useRef<SafeWindowState>(initialState);
  useEffect(() => {
    safeWindowRef.current = safeWindow;
  }, [safeWindow]);

  const closeArrivalModal = () => setShowArrivalModal(false);
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

  // Location Sync Refs
  const lastBackendSyncRef = useRef<number>(0);
  const lastSyncedLocRef = useRef<{ lat: number, lon: number } | null>(null);
  const unsentLocRef = useRef<{ lat: number, lon: number, accuracy?: number, captured_at?: string, provider?: string } | null>(null);
  const isSyncingLocationRef = useRef(false);
  const arrivalStartTimeRef = useRef<number | null>(null);

  // Voice SOS POC 2 State Listener
  useEffect(() => {
    if (!audioEmitter) return;
    const metricSub = audioEmitter.addListener('onAudioMetrics', (event: any) => {
      // Intentionally omitting raw console logs for production
    });
    const stateSub = audioEmitter.addListener('onVoiceMonitoringState', (event: any) => {
      console.log(`[SafeHerAudioPOC] State changed: ${event.state}`);
      if (event.state === 'MIC_START_FAILED') {
        // Here we could handle UI contextually, but importantly, do not crash Location
        console.warn("[SafeHerAudioPOC] Mic FGS failed to start, falling back to location only.");
      }
    });
    return () => {
      metricSub.remove();
      stateSub.remove();
    };
  }, []);

  // Explicit Voice SOS POC 2 Start/Stop commands
  const startAudioCapture = async () => {
    if (Platform.OS !== 'android' || !SafeHerAudioModule) return;
    try {
      const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
      if (granted === PermissionsAndroid.RESULTS.GRANTED) {
        SafeHerAudioModule.startCapture();
      } else {
        console.warn("[VoicePOC] Microphone permission denied. Voice POC disabled.");
      }
    } catch (err) {
      console.warn("[VoicePOC] Permission request failed", err);
    }
  };

  const stopAudioCapture = () => {
    if (Platform.OS === 'android' && SafeHerAudioModule) {
      SafeHerAudioModule.stopCapture();
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
          // routePoints is intentionally left as prev.routePoints here;
          // it will be populated below by the async getRoute re-fetch.
        }));

        missedTriggeredRef.current = false;
        completeInFlightRef.current = false;

        // Fix B: Seed currentLocation immediately from the last known backend position
        // so the traveler marker is visible before the native GPS service fires its
        // first event. Without this, currentLocation stays null after app kill/reopen.
        if (active.current_latitude != null && active.current_longitude != null) {
          setCurrentLocation({ lat: active.current_latitude, lon: active.current_longitude });
        } else if (active.start_latitude != null && active.start_longitude != null) {
          // Fall back to start location if no live fix is recorded yet
          setCurrentLocation({ lat: active.start_latitude, lon: active.start_longitude });
        }

        // Fix A: Re-fetch the route polyline so the map renders the route after app
        // kill/reopen. restoreJourney previously left routePoints = [] because only the
        // 2-point initialRoute is set during a fresh startSafeWindow, and the async
        // getRoute result is never persisted to the backend or to AsyncStorage.
        if (active.start_latitude != null && active.destination_latitude != null) {
          const restoreStart = { latitude: active.start_latitude, longitude: active.start_longitude };
          const restoreDest  = { latitude: active.destination_latitude, longitude: active.destination_longitude };
          // Set a straight-line placeholder immediately so the camera has something to
          // fit to while the real OSRM fetch is in flight.
          setSafeWindow(prev => prev.status === 'ACTIVE' && prev.journeyId === active.id ? {
            ...prev,
            routePoints: [
              { lat: active.start_latitude, lon: active.start_longitude },
              { lat: active.destination_latitude, lon: active.destination_longitude },
            ]
          } : prev);
          // Then fetch the real route asynchronously
          getRoute(restoreStart, restoreDest)
            .then(fetchedRoute => {
              if (fetchedRoute && fetchedRoute.length >= 2) {
                setSafeWindow(prev => prev.status === 'ACTIVE' && prev.journeyId === active.id
                  ? { ...prev, routePoints: fetchedRoute }
                  : prev
                );
              }
            })
            .catch(() => {
              // Straight-line fallback remains — non-fatal
            });
        }

        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          const apiUrl = apiClient.defaults.baseURL || 'https://women-safety-voice-sos.onrender.com';
          await startSafeWindowLocation(session.access_token, apiUrl, session.user.id);
        }

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
        // Defensive kill: backend says no journey active
        stopAudioCapture();
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
      if (_event === 'SIGNED_OUT') {
        stopAudioCapture();
      }
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

  const startSafeWindow = async (durationMinutes: SafeWindowDuration, checkInMinutes: number, startLoc?: { latitude: number, longitude: number, address?: string, placeId?: string, provider?: string }, destLoc?: { latitude: number, longitude: number, address?: string, placeId?: string, provider?: string }, trustedPlace?: TrustedPlace | null) => {
    // Fast path: in-flight guard cannot be self-healed — bail immediately.
    if (startInFlightRef.current || completeInFlightRef.current) {
      throw new Error("Action currently in flight or another journey is already active.");
    }

    // If client state says ACTIVE, verify with the backend before blocking.
    // This self-heals the case where the app was killed mid-journey and
    // restoreJourney ran into a stale/orphaned local state.
    if (safeWindow.status === 'ACTIVE') {
      try {
        const verifyResp = await apiClient.get('/api/journeys');
        const serverActive = Array.isArray(verifyResp.data)
          ? verifyResp.data.find((j: any) => j.status === 'active')
          : null;

        if (!serverActive) {
          // Backend has no active journey — client state is stale. Clear it and proceed.
          console.warn('[SafeWindow] Client thought journey was ACTIVE but backend has none. Clearing stale state.');
          setSafeWindow(initialState);
          startInFlightRef.current = false;
          completeInFlightRef.current = false;
          missedTriggeredRef.current = false;
          stopAudioCapture();
          // Fall through — do NOT return; we want to start a new journey below.
        } else {
          // Backend confirms an active journey genuinely exists — block correctly.
          throw new Error("Action currently in flight or another journey is already active.");
        }
      } catch (verifyErr: any) {
        // If the verify call itself fails (network error, 401), preserve the
        // existing behaviour and block rather than risk double-starting.
        if (verifyErr.message?.includes('already active') || verifyErr.message?.includes('in flight')) {
          throw verifyErr;
        }
        // Network/auth failure during verify — block conservatively.
        throw new Error("Action currently in flight or another journey is already active.");
      }
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

      if (!actualStartLoc) {
        throw new Error("Cannot start journey without a current location. Please enable GPS.");
      }

      // Validate coordinates are finite
      if (!Number.isFinite(actualStartLoc.latitude) || !Number.isFinite(actualStartLoc.longitude)) {
        throw new Error("Invalid start location coordinates. Please try again.");
      }

      if (destLoc && (!Number.isFinite(destLoc.latitude) || !Number.isFinite(destLoc.longitude))) {
        throw new Error("Invalid destination location coordinates. Please try again.");
      }

      let initialRoute: { lat: number, lon: number }[] = [];
      if (actualStartLoc && actualStartLoc.latitude && actualStartLoc.longitude && destLoc && destLoc.latitude && destLoc.longitude) {
        initialRoute = [{ lat: actualStartLoc.latitude, lon: actualStartLoc.longitude }, { lat: destLoc.latitude, lon: destLoc.longitude }];
        // Async route fetch
        getRoute(actualStartLoc, destLoc).then(fetchedRoute => {
          if (fetchedRoute) {
            setSafeWindow(prev => {
              if (prev.status === 'ACTIVE') {
                // [MAP-DEBUG] OSRM resolved AFTER setSafeWindow — route will be applied
                console.log('[MAP-DEBUG] OSRM getRoute resolved, prev.status === ACTIVE → applying', fetchedRoute.length, 'points');
                return { ...prev, routePoints: fetchedRoute };
              } else {
                // [MAP-DEBUG] OSRM resolved BEFORE setSafeWindow set status to ACTIVE
                // — result is discarded. This is the race-condition bug path.
                console.warn('[MAP-DEBUG] OSRM getRoute resolved but prev.status =', prev.status, '(not ACTIVE) → result DISCARDED. Race condition hit.');
                return prev;
              }
            });
          } else {
            console.warn('[MAP-DEBUG] OSRM getRoute returned null — no route to apply');
          }
        }).catch((err) => {
          console.warn('[MAP-DEBUG] OSRM getRoute threw:', err);
        });
        console.log('[MAP-DEBUG] startSafeWindow: initialRoute set with 2 points, OSRM fetch fired async');
      } else {
        console.log('[MAP-DEBUG] startSafeWindow: no destination set — initialRoute is [] (no polyline will render)');
      }

      let journeyData: any;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw { response: { status: 401 } };

        const payload = {
          start_label: "Current Location",
          ...(actualStartLoc ? { start_latitude: actualStartLoc.latitude, start_longitude: actualStartLoc.longitude, start_address: actualStartLoc.address, start_place_id: (actualStartLoc as any).placeId, location_provider: (actualStartLoc as any).provider || (destLoc as any)?.provider } : {}),
          ...(destLoc ? { destination_label: "Destination", destination_latitude: destLoc.latitude, destination_longitude: destLoc.longitude, destination_address: destLoc.address, destination_place_id: (destLoc as any).placeId, location_provider: (destLoc as any).provider || (actualStartLoc as any)?.provider } : {}),
          trusted_place_id: trustedPlace?.id ?? null,
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

        console.log("[SafeWindowStart] payload:", payload);
        const response = await apiClient.post('/api/journeys', payload);
        journeyData = response.data;
        console.log("[SafeWindowStart] response:", journeyData);
      } catch (e: any) {
        console.warn("Could not sync journey start to backend", e);
        console.error("[SafeWindowStart] failed:", e.response?.status, e.response?.data);

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
          } else {
            let errorDetail = e.response.data?.detail || e.response.data?.message || errorMessage;
            if (Array.isArray(errorDetail)) {
              errorDetail = errorDetail.map((err: any) => err.msg || JSON.stringify(err)).join(", ");
            } else if (typeof errorDetail === 'object' && errorDetail !== null) {
              errorDetail = JSON.stringify(errorDetail);
            }
            errorMessage = typeof errorDetail === 'string' ? errorDetail : errorMessage;
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
        distance_km: journeyData.distance_km,
        estimated_duration_minutes: journeyData.estimated_duration_minutes,
        estimated_arrival_at: journeyData.estimated_arrival_at,
        route_status: journeyData.route_status,
      });

      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const apiUrl = apiClient.defaults.baseURL || 'https://women-safety-voice-sos.onrender.com';
        await startSafeWindowLocation(session.access_token, apiUrl, session.user.id);
      }
      startAudioCapture(); // Request microphone natively independently
      await scheduleNextNotification(journeyData.check_in_due_at, demoMode);
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
          const res = await apiClient.post(`/api/journeys/${targetId}/complete`);
        }
      } catch (e) {
        console.warn("Could not sync journey complete to backend", e);
      }
    }
    setSafeWindow(initialState);
    await stopSafeWindowLocation();
    stopAudioCapture(); // User deliberately ends journey
    completeInFlightRef.current = false;
    arrivalStartTimeRef.current = null;
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
            await stopSafeWindowLocation();
            stopAudioCapture(); // User safely completes journey
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
        await stopSafeWindowLocation();
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
    const checkTimers = () => {
      const currentSafeWindow = safeWindowRef.current;
      if (currentSafeWindow.status !== 'ACTIVE') return;
      const now = new Date().getTime();

      // Missed check-in
      if (currentSafeWindow.checkInDueAt && now >= new Date(currentSafeWindow.checkInDueAt).getTime()) {
        markMissedCheckIn();
      } else if (currentSafeWindow.endsAt && now >= new Date(currentSafeWindow.endsAt).getTime()) {
        endSafeWindow();
      }
    };

    if (safeWindow.status === 'ACTIVE') {
      timerInterval = setInterval(checkTimers, 1000);
    }

    const subscription = AppState.addEventListener('change', nextAppState => {
      if (nextAppState === 'active' && safeWindow.status === 'ACTIVE') {
        checkTimers();
      }
    });

    return () => {
      if (timerInterval) clearInterval(timerInterval);
      subscription.remove();
    };
  }, [safeWindow.status]);

  useEffect(() => {
    let locationSubscription: Location.LocationSubscription | null = null;
    let emitterSubscription: any = null;
    let isMounted = true;

    const startLocationWatcher = async () => {
      try {
        console.log("[SafeWindowContext] Requesting foreground permissions for watcher...");
        let fgStatus = (await Location.getForegroundPermissionsAsync()).status;
        if (fgStatus !== 'granted') {
          const req = await Location.requestForegroundPermissionsAsync();
          fgStatus = req.status;
        }

        if (fgStatus !== 'granted') {
          console.warn("[SafeWindowContext] Location permissions not granted for watcher.");
          return;
        }
        if (!isMounted) return;
        console.log("[SafeWindowContext] Location permission granted. Starting watcher...");

        emitterSubscription = locationSharingEmitter.addListener('onLocationUpdated', async (payloadStr: string) => {
            const currentSafeWindow = safeWindowRef.current;
            if (!isMounted || currentSafeWindow.status !== 'ACTIVE') return;

            let loc;
            try {
              loc = JSON.parse(payloadStr);
            } catch(e) {
              return;
            }

            console.log(`[SafeWindowContext] Watcher received location: lat=${loc.latitude}, lon=${loc.longitude}, accuracy=${loc.accuracy}`);

            const now = new Date().getTime();
            const currentLoc = { lat: loc.latitude, lon: loc.longitude };
            setCurrentLocation(currentLoc);
            const capturedAt = new Date(loc.timestamp || now).toISOString();

            // 1. Sync backend tracking (every 20s OR > 25m movement)
            if (currentSafeWindow.journeyId && !isSyncingLocationRef.current) {
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
                  accuracy: loc.coords.accuracy || 9999,
                  captured_at: capturedAt,
                  provider: 'watchPosition'
                };

                try {
                  console.log(`[SafeWindowContext] Syncing location to backend... Payload:`, payload);
                  await apiClient.patch(`/api/journeys/${currentSafeWindow.journeyId}/location`, payload);
                  console.log(`[SafeWindowContext] Backend location sync successful.`);
                  lastBackendSyncRef.current = now;
                  lastSyncedLocRef.current = currentLoc;
                  unsentLocRef.current = null;
                } catch (e) {
                  console.warn("[SafeWindowContext] Could not sync location to backend (offline/network issue)", e);
                  if (!unsentLocRef.current) {
                    unsentLocRef.current = { lat: currentLoc.lat, lon: currentLoc.lon, accuracy: loc.coords.accuracy || 9999, captured_at: capturedAt, provider: 'watchPosition' };
                  }
                } finally {
                  isSyncingLocationRef.current = false;
                }
              }
            }

            // 2. Distance check and robust arrival detection
            if (currentSafeWindow.destinationLocation && !currentSafeWindow.demoMode &&
              typeof currentSafeWindow.destinationLocation.latitude === 'number' &&
              typeof currentSafeWindow.destinationLocation.longitude === 'number' &&
              typeof currentLoc.lat === 'number' && typeof currentLoc.lon === 'number') {
              const destLoc = { lat: currentSafeWindow.destinationLocation.latitude, lon: currentSafeWindow.destinationLocation.longitude };
              const distToDest = distanceBetweenPointsMeters(currentLoc.lat, currentLoc.lon, destLoc.lat, destLoc.lon);
              setDistanceToDestination(distToDest);

              // Robust Arrival Detection: Distance < 50m, Speed < 2 m/s
              const speed = loc.coords.speed || 0;
              if (distToDest < 50 && speed < 2) {
                if (!arrivalStartTimeRef.current) {
                  arrivalStartTimeRef.current = now;
                } else if (now - arrivalStartTimeRef.current >= 10000) {
                  // Reached destination for 10 seconds -> Complete Journey
                  console.log(`[SafeWindowContext] Robust arrival detected. Completing journey...`);
                  endSafeWindow();
                  setShowArrivalModal(true);
                  arrivalStartTimeRef.current = null;
                }
              } else {
                arrivalStartTimeRef.current = null;
              }
            } else {
              setDistanceToDestination(null);
              arrivalStartTimeRef.current = null;
            }

            // 3. Route deviation check
            if (currentSafeWindow.routePoints && currentSafeWindow.routePoints.length > 2 && currentSafeWindow.destinationLocation && !currentSafeWindow.routeDeviationDetected && !currentSafeWindow.demoMode) {
              if (isRouteDeviation(currentLoc, currentSafeWindow.routePoints!, 300)) {
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
          }
        );

        } catch (err) {
        console.error("[SafeWindowContext] Error starting watcher", err);
      }
    };

    if (safeWindow.status === 'ACTIVE') {
      startLocationWatcher();
    }

    return () => {
      isMounted = false;
      if (emitterSubscription) {
        emitterSubscription.remove();
      }
    };
  }, [safeWindow.status]);

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
      checkAndPromptBatteryExemption,
      isStartingJourney,
      showArrivalModal,
      closeArrivalModal,
      currentLocation
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

