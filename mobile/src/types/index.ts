export type RootStackParamList = {
  Login: undefined;
  Home: undefined;
  SOS: undefined;
  SilentSOS: undefined;
  Contacts: undefined;
  SafeWindow: undefined;
  DeadManCheckIn: undefined;
  AlertHistory: undefined;
  Settings: undefined;
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
  | 'GUARDIAN_NOTIFICATION_SENT';

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
    accuracy?: number | null;
    mapLink: string;
    capturedAt: string;
    permissionDenied?: boolean;
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

export interface SafeWindowState {
  status: SafeWindowStatus;
  durationMinutes: SafeWindowDuration | null;
  startedAt: string | null;
  endsAt: string | null;
  checkInDueAt: string | null;
  lastCheckInAt: string | null;
  demoMode: boolean;
  missedCheckInAt?: string | null;
  startLocation?: { latitude: number; longitude: number } | null;
  destinationLocation?: { latitude: number; longitude: number } | null;
  routeDeviationDetected?: boolean;
}
