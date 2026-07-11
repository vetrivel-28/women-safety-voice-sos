import { AppNotification } from '../context/NotificationContext';
import { RootStackParamList } from '../types';
import { NavigationProp } from '@react-navigation/native';

export type NotificationTarget = {
  screen: keyof RootStackParamList;
  params?: any;
};

export function getNotificationTarget(notification: AppNotification): NotificationTarget | null {
  const meta = notification.metadata || {};
  const type = notification.type;

  switch (type) {
    case 'family_join_requested':
      return { screen: 'FamilyMembers', params: { familyId: meta.family_id, requestId: meta.request_id } };
    case 'family_join_approved':
      return { screen: 'FamilyDashboard', params: { familyId: meta.family_id } };
    case 'family_join_rejected':
      return { screen: 'JoinFamily' };
    case 'guardian_linked':
      return { screen: 'GuardianPersonDetail', params: { wardId: meta.ward_id || meta.user_id } };
    case 'sos_triggered':
    case 'ward_alert':
    case 'guardian_alert':
      return { screen: 'GuardianAlertDetails', params: { alertId: meta.alert_id } };
    case 'guardian_acknowledged_alert':
    case 'guardian_responding_alert':
    case 'guardian_called_ward':
    case 'guardian_resolved_alert':
      return { screen: 'AlertHistory', params: { alertId: meta.alert_id } };
    case 'safe_window_started':
    case 'safe_window_checkin_missed':
    case 'safe_window_escalated_critical':
    case 'safe_window_reached_trusted_place':
    case 'safe_window_ended':
    case 'safe_window_escalation_repeat':
      // The ward-side detail might not exist, but GuardianDashboard or SafeWindow is a safe fallback
      return { screen: 'GuardianDashboard', params: { journeyId: meta.journey_id } };
    case 'family_location_sharing_enabled':
    case 'family_location_sharing_disabled':
      return { screen: 'FamilyLiveMap', params: { familyId: meta.family_id } };
    default:
      return null;
  }
}

export function navigateFromNotification(navigation: NavigationProp<RootStackParamList>, notification: AppNotification) {
  const target = getNotificationTarget(notification);
  if (target) {
    navigation.navigate(target.screen as any, target.params);
  }
}
