import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { apiClient } from '../api/client';
import { startLocationSharing, stopLocationSharing, getLocationSharingStatus } from '../modules/LocationSharingModule';

export interface Family {
  id: string;
  family_name: string;
  family_pin: string;
  host_user_id: string;
  created_at: string;
}

export interface FamilyMember {
  id: string;
  family_id: string;
  user_id: string;
  role: 'host' | 'member';
  status: 'active' | 'left' | 'removed';
  joined_at: string;
  profiles?: {
    id: string;
    email: string;
    phone: string;
    full_name: string;
  };
}

export interface JoinRequest {
  id: string;
  family_id: string;
  requester_user_id: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  responded_at?: string | null;
  // Embedded family name (from /my/current pending response)
  families?: {
    family_name: string;
  };
}

interface FamilyContextData {
  family: Family | null;
  members: FamilyMember[];
  joinRequests: JoinRequest[];   // pending requests visible to the host
  myPendingRequest: JoinRequest | null;  // the current user's own pending request
  pendingFamilyName: string;     // family name for pending request screen
  activeSOS: any[];
  activeJourneys: any[];
  loading: boolean;
  refresh: () => Promise<void>;
  createFamily: (name: string) => Promise<void>;
  joinFamily: (pin: string) => Promise<void>;
  approveJoin: (requestId: string) => Promise<void>;
  rejectJoin: (requestId: string) => Promise<void>;
  removeMember: (memberId: string) => Promise<void>;
  leaveFamily: () => Promise<void>;
  regeneratePin: () => Promise<void>;
  isSharingEnabled: boolean | null;
  toggleLocationSharing: (val: boolean) => Promise<void>;
}

const FamilyContext = createContext<FamilyContextData>({
  family: null,
  members: [],
  joinRequests: [],
  myPendingRequest: null,
  pendingFamilyName: '',
  activeSOS: [],
  activeJourneys: [],
  loading: true,
  refresh: async () => {},
  createFamily: async () => {},
  joinFamily: async () => {},
  approveJoin: async () => {},
  rejectJoin: async () => {},
  removeMember: async () => {},
  leaveFamily: async () => {},
  regeneratePin: async () => {},
  isSharingEnabled: null,
  toggleLocationSharing: async () => {},
});

export const FamilyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [family, setFamily] = useState<Family | null>(null);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([]);
  const [myPendingRequest, setMyPendingRequest] = useState<JoinRequest | null>(null);
  const [pendingFamilyName, setPendingFamilyName] = useState('');
  const [activeSOS, setActiveSOS] = useState<any[]>([]);
  const [activeJourneys, setActiveJourneys] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSharingEnabled, setIsSharingEnabled] = useState<boolean | null>(null);

  const currentFamilyIdRef = useRef<string | null>(null);
  const channelRef = useRef<any>(null);
  const fetchInFlightRef = useRef(false);

  const fetchDashboard = async (overrideSession?: any) => {
    // Prevent concurrent fetches
    if (fetchInFlightRef.current) { return; }
    fetchInFlightRef.current = true;
    try {
      setLoading(true);
      let session = overrideSession;
      if (!session) {
        const { data } = await supabase.auth.getSession();
        session = data.session;
      }

      if (!session) {
        clearState();
        return;
      }

      // Single backend call gives us: null | {status:'pending',...} | active membership
      const response = await apiClient.get('/api/family/my/current');
      const payload = response.data;

      // ── Case 1: no family, no pending request ──────────────────────────────
      if (!payload) {
        setFamily(null);
        setMembers([]);
        setJoinRequests([]);
        setActiveSOS([]);
        setActiveJourneys([]);
        setMyPendingRequest(null);
        setPendingFamilyName('');
        currentFamilyIdRef.current = null;
        return;
      }

      // ── Case 2: pending join request ───────────────────────────────────────
      if (payload.status === 'pending') {
        setFamily(null);
        setMembers([]);
        setJoinRequests([]);
        setActiveSOS([]);
        setActiveJourneys([]);
        currentFamilyIdRef.current = null;
        setMyPendingRequest(payload.join_request as JoinRequest);
        setPendingFamilyName(payload.family_name || '');
        return;
      }

      // ── Case 3: active membership row (contains embedded families object) ──
      setMyPendingRequest(null);
      setPendingFamilyName('');

      const fam: Family = payload.families;
      if (!fam) {
        // Malformed response — treat as no family
        clearState();
        return;
      }

      setFamily(fam);
      currentFamilyIdRef.current = fam.id;

      const [dashResponse, membersResponse] = await Promise.all([
        apiClient.get(`/api/family/${fam.id}/dashboard`),
        apiClient.get(`/api/family/${fam.id}/members`)
      ]);
      
      setActiveSOS(dashResponse.data.active_sos || []);
      setActiveJourneys(dashResponse.data.active_journeys || []);
      setMembers(membersResponse.data || []);

      hydrateLocationSharing(session, fam.id);

      // If host, fetch pending join requests from backend (no direct Supabase needed)
      if (fam.host_user_id === session.user.id) {
        try {
          const reqsResponse = await apiClient.get(`/api/family/${fam.id}/join-requests`);
          setJoinRequests(reqsResponse.data || []);
        } catch {
          setJoinRequests([]);
        }
      } else {
        setJoinRequests([]);
      }

    } catch (e: any) {
      if (e.response?.status === 404 || e.response?.status === 403) {
        clearState();
      } else {
        console.error('[FamilyContext] fetchDashboard Error:', e);
      }
    } finally {
      setLoading(false);
      fetchInFlightRef.current = false;
    }
  };

  const clearState = () => {
    setFamily(null);
    setMembers([]);
    setJoinRequests([]);
    setMyPendingRequest(null);
    setPendingFamilyName('');
    setActiveSOS([]);
    setActiveJourneys([]);
    currentFamilyIdRef.current = null;
    setLoading(false);
    setIsSharingEnabled(false);
    fetchInFlightRef.current = false;
  };

  const hydrateLocationSharing = async (session: any, famId: string | null) => {
    if (!session || !session.user || !famId) {
      if (isSharingEnabled !== false) setIsSharingEnabled(false);
      return;
    }
    const userId = session.user.id;
    try {
      const nativeStatus = await getLocationSharingStatus();
      
      let backendSharingEnabled = false;
      try {
         const locResponse = await apiClient.get(`/api/family/${famId}/locations`);
         const myLoc = locResponse.data.find((l: any) => l.user_id === userId);
         if (myLoc) {
            backendSharingEnabled = myLoc.sharing_enabled;
         }
      } catch(e) {
         console.warn("[FamilyContext] Failed to fetch backend location preference", e);
         backendSharingEnabled = nativeStatus.preferenceEnabled;
      }
      
      if (nativeStatus.storedUserId && nativeStatus.storedUserId !== userId) {
         console.log("[LocationSharing] Account switched! Stopping previous user's sharing");
         await stopLocationSharing();
         setIsSharingEnabled(false);
         return;
      }

      if (backendSharingEnabled && !nativeStatus.serviceRunning) {
         console.log("[LocationSharing] Backend says true, but service is stopped. Restarting...");
         const apiUrl = apiClient.defaults.baseURL || 'https://women-safety-voice-sos.onrender.com';
         await startLocationSharing(session.access_token, apiUrl, userId);
         setIsSharingEnabled(true);
      }
      else if (!backendSharingEnabled && nativeStatus.serviceRunning) {
         console.log("[LocationSharing] Backend says false, but service is running. Stopping...");
         await stopLocationSharing();
         setIsSharingEnabled(false);
      } else {
         setIsSharingEnabled(backendSharingEnabled);
      }
    } catch(e) {
      console.warn("[LocationSharing] Error hydrating", e);
    }
  };

  // Track current authenticated user to detect account switches
  const currentUserIdRef = useRef<string | null>(null);

  // Initial load + realtime subscriptions + auth-change reset
  useEffect(() => {
    // ── Auth-change handler: reset all family state on user switch ──────────
    const { data: authSub } = supabase.auth.onAuthStateChange((_event, session) => {
      const newUserId = session?.user?.id ?? null;
      const oldUserId = currentUserIdRef.current;

      if (newUserId !== oldUserId) {
        currentUserIdRef.current = newUserId;

        // Stop in-flight requests from the old user reaching our state
        if (channelRef.current) {
          supabase.removeChannel(channelRef.current);
          channelRef.current = null;
        }

        // Unconditionally clear all family state before fetching for new user
        clearState();

        if (newUserId) {
          fetchDashboard(session);
        }
      }
    });

    // Seed current user on mount
    supabase.auth.getSession().then(({ data }) => {
      const userId = data?.session?.user?.id ?? null;
      currentUserIdRef.current = userId;
      fetchDashboard();
    });

    const setupRealtime = () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
      channelRef.current = supabase
        .channel('family_module_updates')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'family_members' }, fetchDashboard)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'family_join_requests' }, fetchDashboard)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'sos_alerts' }, fetchDashboard)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'safe_windows' }, fetchDashboard)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'families' }, fetchDashboard)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'family_member_locations' }, fetchDashboard)
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'family_member_locations' }, fetchDashboard)
        .subscribe();
    };

    setupRealtime();

    return () => {
      authSub.subscription.unsubscribe();
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, []);

  // Methods
  const createFamily = async (name: string) => {
    await apiClient.post('/api/family/', { family_name: name });
    await fetchDashboard();
  };

  const joinFamily = async (pin: string) => {
    await apiClient.post('/api/family/join', { family_pin: pin });
    await fetchDashboard();
  };

  const approveJoin = async (requestId: string) => {
    await apiClient.post(`/api/family/join-requests/${requestId}/approve`);
    await fetchDashboard();
  };

  const rejectJoin = async (requestId: string) => {
    await apiClient.post(`/api/family/join-requests/${requestId}/reject`);
    await fetchDashboard();
  };

  const removeMember = async (memberId: string) => {
    if (!family) return;
    await apiClient.delete(`/api/family/${family.id}/members/${memberId}`);
    await fetchDashboard();
  };

  const leaveFamily = async () => {
    if (!family) return;
    await apiClient.post(`/api/family/${family.id}/leave`);
    clearState();
    await fetchDashboard();
  };

  const regeneratePin = async () => {
    if (!family) return;
    await apiClient.post(`/api/family/${family.id}/regenerate-pin`);
    await fetchDashboard();
  };

  const toggleLocationSharing = async (val: boolean) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || !family) return;

    setIsSharingEnabled(val);

    try {
      if (val) {
        const apiUrl = apiClient.defaults.baseURL || 'https://women-safety-voice-sos.onrender.com';
        await startLocationSharing(session.access_token, apiUrl, session.user.id);
      } else {
        await stopLocationSharing();
      }
      await apiClient.patch('/api/family/me/location-sharing', { sharing_enabled: val });
    } catch (e) {
      console.error("[LocationSharing] toggle error", e);
      setIsSharingEnabled(!val);
    }
  };

  return (
    <FamilyContext.Provider value={{
      family,
      members,
      joinRequests,
      myPendingRequest,
      pendingFamilyName,
      activeSOS,
      activeJourneys,
      loading,
      refresh: fetchDashboard,
      createFamily,
      joinFamily,
      approveJoin,
      rejectJoin,
      removeMember,
      leaveFamily,
      regeneratePin,
      isSharingEnabled,
      toggleLocationSharing,
    }}>
      {children}
    </FamilyContext.Provider>
  );
};

export const useFamily = () => useContext(FamilyContext);
