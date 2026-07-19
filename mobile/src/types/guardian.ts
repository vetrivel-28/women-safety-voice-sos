export type GuardianStatus = 'SOS ACTIVE' | 'CHECK-IN MISSED' | 'JOURNEY ACTIVE' | 'SAFE';

export interface GuardedUser {
  protectedUserId: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  status: GuardianStatus;
  active_alerts: number;
  active_journeys: number;
  last_activity?: any;
  last_location?: {
    latitude: number | null;
    longitude: number | null;
    accuracy: number | null;
    captured_at: string | null;
  };
}

export interface GuardianJourney {
  id: string;
  user_id: string;
  started_at: string;
  ends_at: string;
  check_in_due_at: string;
  last_check_in_at: string;
  status: string; // 'ACTIVE', 'COMPLETED', 'MISSED_CHECKIN'
  duration_minutes: number;
  start_address?: string;
  start_latitude?: number;
  start_longitude?: number;
  destination_address?: string;
  destination_latitude?: number;
  destination_longitude?: number;
  current_latitude?: number;
  current_longitude?: number;
  last_location_at?: string;
  distance_km?: number;
  estimated_duration_minutes?: number;
  estimated_arrival_at?: string;
  route_status?: string;
  route_polyline?: string;
  profiles?: {
    full_name: string;
    phone: string;
  };
}

export interface GuardianAlert {
  id: string;
  user_id: string;
  trigger_type: string;
  status: string; // 'ACTIVE', 'CANCELLED', 'RESOLVED'
  created_at: string;
  location_lat?: number;
  location_long?: number;
  visible_message?: string;
  profiles?: {
    full_name: string;
    phone: string;
  };
}

export interface ActivityEvent {
  id: string;
  user_id: string;
  type: 'JOURNEY_STARTED' | 'JOURNEY_COMPLETED' | 'MISSED_CHECKIN' | 'MANUAL_SOS' | 'SILENT_SOS';
  timestamp: string;
  title: string;
  description: string;
  isEmergency: boolean;
}

export interface GuardianDashboardModel {
  guardedUsers: GuardedUser[];
  activeJourneys: GuardianJourney[];
  activeAlerts: GuardianAlert[];
  recentActivity: ActivityEvent[];
  lastUpdated: string | null;
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
}
