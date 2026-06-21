export type RootStackParamList = {
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

export type TriggerType = 'MANUAL_SOS' | 'SILENT_SOS';

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
}

export interface EmergencyContact {
  id: string;
  name: string;
  phone: string;
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
}
