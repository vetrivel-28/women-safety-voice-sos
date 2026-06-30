import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { apiClient } from '../api/client';

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
  requested_at: string;
  profiles?: {
    id: string;
    email: string;
    full_name: string;
  };
}

interface FamilyContextData {
  family: Family | null;
  members: FamilyMember[];
  joinRequests: JoinRequest[];
  myPendingRequest: JoinRequest | null;
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
}

const FamilyContext = createContext<FamilyContextData>({
  family: null,
  members: [],
  joinRequests: [],
  myPendingRequest: null,
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
});

export const FamilyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [family, setFamily] = useState<Family | null>(null);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([]);
  const [myPendingRequest, setMyPendingRequest] = useState<JoinRequest | null>(null);
  const [activeSOS, setActiveSOS] = useState<any[]>([]);
  const [activeJourneys, setActiveJourneys] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const currentFamilyIdRef = useRef<string | null>(null);
  const channelRef = useRef<any>(null);

  const fetchDashboard = async () => {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        clearState();
        return;
      }

      // Fetch my current family membership and family details
      const response = await apiClient.get('/api/family/my/current');
      
      if (!response.data) {
        // No active family. Check if we have a pending join request.
        const { data: pendingReqs } = await supabase
          .from('family_join_requests')
          .select('*, families(family_name)')
          .eq('requester_user_id', session.user.id)
          .eq('status', 'pending');
          
        if (pendingReqs && pendingReqs.length > 0) {
           setMyPendingRequest(pendingReqs[0] as any);
        } else {
           setMyPendingRequest(null);
        }
        
        // Ensure state is cleared for active family data
        setFamily(null);
        setMembers([]);
        setJoinRequests([]);
        setActiveSOS([]);
        setActiveJourneys([]);
        currentFamilyIdRef.current = null;
        return;
      }

      setMyPendingRequest(null);
      const myMembership = response.data;
      const fam = myMembership.families;
      
      setFamily(fam);
      currentFamilyIdRef.current = fam.id;

      // Fetch dashboard data
      const dashResponse = await apiClient.get(`/api/family/${fam.id}/dashboard`);
      setActiveSOS(dashResponse.data.active_sos || []);
      setActiveJourneys(dashResponse.data.active_journeys || []);
      
      // We only have user profiles in dashboard currently, let's fetch full members list for dashboard cards
      const membersResponse = await apiClient.get(`/api/family/${fam.id}/members`);
      setMembers(membersResponse.data || []);

      // If host, fetch join requests
      if (fam.host_user_id === session.user.id) {
        // Fallback to supabase directly for requests since we didn't expose a specific endpoint for fetching them in backend,
        const { data: reqs } = await supabase
          .from('family_join_requests')
          .select('*, profiles:requester_user_id(id, email, full_name)')
          .eq('family_id', fam.id)
          .eq('status', 'pending');
        setJoinRequests(reqs || []);
      } else {
        setJoinRequests([]);
      }

    } catch (e: any) {
      if (e.response?.status === 404 || e.response?.status === 403) {
        // User likely was removed or left
        clearState();
      } else {
        console.error('[FamilyContext] fetchDashboard Error:', e);
      }
    } finally {
      setLoading(false);
    }
  };

  const clearState = () => {
    setFamily(null);
    setMembers([]);
    setJoinRequests([]);
    setMyPendingRequest(null);
    setActiveSOS([]);
    setActiveJourneys([]);
    currentFamilyIdRef.current = null;
    setLoading(false);
  };

  // Realtime subscription management
  useEffect(() => {
    fetchDashboard();

    const setupRealtime = () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }

      channelRef.current = supabase.channel('family_module_updates')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'family_members' }, () => {
          fetchDashboard();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'family_join_requests' }, () => {
          fetchDashboard();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'sos_alerts' }, () => {
          fetchDashboard();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'journey_sessions' }, () => {
          fetchDashboard();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'families' }, () => {
          fetchDashboard();
        })
        .subscribe();
    };

    setupRealtime();

    return () => {
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
    clearState(); // force clear immediately instead of waiting for fetch
    await fetchDashboard();
  };

  const regeneratePin = async () => {
    if (!family) return;
    await apiClient.post(`/api/family/${family.id}/regenerate-pin`);
    await fetchDashboard();
  };

  return (
    <FamilyContext.Provider value={{
      family,
      members,
      joinRequests,
      myPendingRequest,
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
    }}>
      {children}
    </FamilyContext.Provider>
  );
};

export const useFamily = () => useContext(FamilyContext);
