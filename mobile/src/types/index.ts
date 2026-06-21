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
}

export interface EmergencyContact {
  id: string;
  name: string;
  phone: string;
  relationship: string;
  priority: number;
}
