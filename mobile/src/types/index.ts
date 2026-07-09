export type RootStackParamList = {
  Login: undefined;
  MainTabs: undefined; // The new bottom tab navigator
  Home: undefined; // Keeping it for any internal navigation reference if needed
  SOS: undefined;
  SilentSOS: undefined;
  Contacts: undefined;
  SafeWindow: undefined;
  DeadManCheckIn: undefined;
  AlertHistory: undefined;
  Settings: undefined;
  GuardianDashboard: undefined;
  GuardianAlertDetails: { alertId?: string; journeyId?: string };
  GuardianPersonDetail: { protectedUserId: string; name?: string; status?: string };
  Notifications: undefined;
  FamilyDashboard: { familyId?: string } | undefined;
  FamilyLiveMap: { familyId?: string } | undefined;
  FamilyMembers: { familyId?: string; requestId?: string } | undefined;
  FamilySettings: undefined;
  JoinFamily: undefined;
  CreateFamily: undefined;
};

export type AlertStatus = 'ACTIVE' | 'CANCELLED' | 'SILENT_DURESS_ACTIVE' | 'RESOLVED';

export type TriggerType = 
  | 'MANUAL_SOS'
  | 'SILENT_SOS'
  | 'MISSED_CHECK_IN'
  | 'SAFE_WINDOW_MISSED'
  | 'ROUTE_DEVIATION'
  | 'RISK_SCORE_HIGH'
  | 'JOURNEY_MISSED_CHECKIN'
  | 'DEAD_MAN_MISSED'
  | 'GUARDIAN_NOTIFICATION_FAILED'
  | 'GUARDIAN_NOTIFICATION_SENT'
  | 'HARDWARE_SOS';

export interface SOSAlert {
  id: string;
  triggerType: TriggerType;
  status: AlertStatus;
  createdAt: string;
  cancelledAt?: string;
  cancelMethod?: 'REAL_PIN' | 'DURESS_PIN' | 'NONE';
  visibleMessage: string;
  location?: {
    latitude: number;
    longitude: number;
    accuracy: number;
    mapLink: string;
    captured_at: string;
    provider: string;
    permissionDenied: boolean;
  };
  syncStatus?: 'PENDING_SYNC' | 'SYNCED' | 'FAILED_SYNC';
  backendId?: string;
  lastSyncError?: string;
  syncedAt?: string;
  ownerUserId?: string;
}

export interface EmergencyContact {
  id: string;
  name: string;
  phone: string;
  email?: string;
  relationship: string;
  priority: number;
  createdAt: string;
}

export type SafeWindowStatus = 'INACTIVE' | 'ACTIVE' | 'COMPLETED' | 'MISSED_CHECKIN';

export type SafeWindowDuration = 15 | 30 | 60 | 0.5;

export type SafeWindowSeverity = 'NORMAL' | 'HIGH' | 'CRITICAL' | 'RESOLVED';

export interface SafeWindowState {
  journeyId?: string;
  status: SafeWindowStatus;
  durationMinutes: SafeWindowDuration | null;
  startedAt: string | null;
  endsAt: string | null;
  checkInDueAt: string | null;
  lastCheckInAt: string | null;
  demoMode: boolean;
  missedCheckInAt?: string | null;
  startLocation?: { latitude: number; longitude: number } | null;
  destinationLocation?: { latitude: number; longitude: number; address?: string } | null;
  routePoints?: {lat: number, lon: number}[];
  routeDeviationWarningAt?: string | null;
  routeDeviationDetected?: boolean;
  distance_km?: number | null;
  estimated_duration_minutes?: number | null;
  estimated_arrival_at?: string | null;
  route_status?: string | null;
  // Trusted Place fields
  trustedPlaceId?: string | null;
  destinationName?: string | null;
  destinationRadiusMeters?: number | null;
  notifyGuardiansOnArrival?: boolean;
  // Escalation fields
  severity?: SafeWindowSeverity;
  escalatedAt?: string | null;
  escalatedReason?: string | null;
  // Auto-complete tracking (mobile-only, not persisted)
  reachedTrustedPlace?: boolean;
}

// ── Trusted Places ──────────────────────────────────────────────────────────

export type TrustedPlaceLabel =
  | 'Home'
  | 'Office'
  | 'College'
  | 'Hostel'
  | "Friend's House"
  | 'Other';

export const TRUSTED_PLACE_LABELS: TrustedPlaceLabel[] = [
  'Home', 'Office', 'College', 'Hostel', "Friend's House", 'Other',
];

export const TRUSTED_PLACE_LABEL_ICONS: Record<TrustedPlaceLabel, string> = {
  Home: '🏠',
  Office: '🏢',
  College: '🎓',
  Hostel: '🏨',
  "Friend's House": '👫',
  Other: '📍',
};

export interface TrustedPlace {
  id: string;
  user_id: string;
  name: string;
  label: TrustedPlaceLabel | null;
  latitude: number;
  longitude: number;
  address: string | null;
  radius_meters: number;
  notify_guardians_on_arrival: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ── Family Location ──────────────────────────────────────────────────────────

export type FamilyMemberLocationStatus =
  | 'SAFE'
  | 'IN_SAFE_WINDOW'
  | 'SOS_ACTIVE'
  | 'CHECKIN_MISSED'
  | 'OFFLINE';

export interface FamilyMemberLocation {
  id: string;
  family_id: string;
  user_id: string;
  role?: string;
  has_location?: boolean;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  status: FamilyMemberLocationStatus;
  source: string | null;
  sharing_enabled: boolean;
  updated_at: string | null;
  is_stale?: boolean;
  profiles?: {
    id: string;
    full_name: string | null;
    email: string | null;
  };
}
