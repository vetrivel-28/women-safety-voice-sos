import React, { useEffect, useState } from 'react';
import { Text, View, ActivityIndicator } from 'react-native';
import * as Linking from 'expo-linking';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNavigationContainerRef } from '@react-navigation/native';
import { RootStackParamList } from '../types';

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

import HomeScreen from '../screens/HomeScreen';
import { SOSScreen } from '../screens/SOSScreen';
import { SilentSOSScreen } from '../screens/SilentSOSScreen';
import { ContactsScreen } from '../screens/ContactsScreen';
import { SafeWindowScreen } from '../screens/SafeWindowScreen';
import { DeadManCheckInScreen } from '../screens/DeadManCheckInScreen';
import { AlertHistoryScreen } from '../screens/AlertHistoryScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { GuardianDashboardScreen } from '../screens/GuardianDashboardScreen';
import { GuardianAlertDetailsScreen } from '../screens/GuardianAlertDetailsScreen';
import { GuardianPersonDetailScreen } from '../screens/GuardianPersonDetailScreen';
import { NotificationsScreen } from '../screens/NotificationsScreen';
import LoginScreen from '../screens/LoginScreen';
import { supabase } from '../lib/supabaseClient';
import { Session } from '@supabase/supabase-js';

// Import Family Screens
import FamilyDashboardScreen from '../screens/FamilyDashboardScreen';
import FamilyLiveMapScreen from '../screens/FamilyLiveMapScreen';
import FamilyMembersScreen from '../screens/FamilyMembersScreen';
import FamilySettingsScreen from '../screens/FamilySettingsScreen';
import JoinFamilyScreen from '../screens/JoinFamilyScreen';
import CreateFamilyScreen from '../screens/CreateFamilyScreen';
import ProfileRepairScreen from '../screens/ProfileRepairScreen';
import LocationPickerScreen from '../screens/LocationPickerScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator();

// ... existing MainTabs ...
function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#EF4444',
        tabBarInactiveTintColor: '#94A3B8',
        tabBarStyle: {
          backgroundColor: '#FFF7F7',
          borderTopWidth: 1,
          borderTopColor: '#FEE2E2',
          paddingBottom: 5,
          paddingTop: 5,
        },
      }}
    >
      <Tab.Screen 
        name="HomeTab" 
        component={HomeScreen} 
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>🏠</Text>,
        }} 
      />
      <Tab.Screen 
        name="FamilyTab" 
        component={FamilyDashboardScreen} 
        options={{
          tabBarLabel: 'Family',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>👨‍👩‍👧‍👦</Text>,
        }} 
      />
    </Tab.Navigator>
  );
}

export const AppNavigator = () => {
  const [session, setSession] = React.useState<Session | null>(null);
  const [profileStatus, setProfileStatus] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let active = true;

    const checkProfile = async (currentSession: Session) => {
      try {
        const { API_BASE_URL } = require('../api/client');
        const res = await fetch(`${API_BASE_URL}/api/auth/me`, {
          headers: {
            'Authorization': `Bearer ${currentSession.access_token}`
          }
        });
        if (res.ok && active) {
          const data = await res.json();
          setProfileStatus(data.status); // PROFILE_INCOMPLETE_RETRYABLE or active
        } else if (active) {
          setProfileStatus('ERROR');
        }
      } catch (e) {
        console.error(e);
        if (active) setProfileStatus('ERROR');
      } finally {
        if (active) setLoading(false);
      }
    };

    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      if (active) {
        setSession(currentSession);
        if (currentSession) {
          checkProfile(currentSession);
        } else {
          setLoading(false);
        }
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) {
        setSession(session);
        if (session) {
          setLoading(true);
          checkProfile(session);
        } else {
          setProfileStatus(null);
          setLoading(false);
        }
      }
    });

    const handleDeepLink = async ({ url }: { url: string }) => {
      if (!url) return;

      // Handle Supabase auth callback (magic link / OAuth)
      const match = url.match(/#access_token=([^&]+)/);
      const refreshTokenMatch = url.match(/&refresh_token=([^&]+)/);

      if (match && refreshTokenMatch) {
        const access_token = match[1];
        const refresh_token = refreshTokenMatch[1];
        await supabase.auth.setSession({ access_token, refresh_token });
        return;
      }

      // Handle custom scheme deep links: safeher://<path>?<params>
      try {
        const parsedUrl = Linking.parse(url);
        const path = parsedUrl.path ?? '';
        const params = parsedUrl.queryParams ?? {};

        const navigate = (screen: string, screenParams?: object) => {
          if (navigationRef.current) {
            // @ts-ignore — dynamic navigation
            navigationRef.current.navigate(screen, screenParams);
          }
        };

        // safeher://guardian or safeher://guardian?alertId=xxx&journeyId=yyy
        if (path === 'guardian' || params.screen === 'guardian') {
          if (params.alertId || params.journeyId) {
            navigate('GuardianAlertDetails', {
              alertId: params.alertId as string | undefined,
              journeyId: params.journeyId as string | undefined,
            });
          } else {
            navigate('GuardianDashboard');
          }
          return;
        }

        // safeher://family or safeher://family?familyId=xxx
        if (path === 'family' || params.screen === 'family') {
          navigate('FamilyLiveMap', {
            familyId: params.familyId as string | undefined,
          });
          return;
        }

        // safeher://alert?alertId=xxx
        if (path === 'alert' || params.alertId) {
          navigate('GuardianAlertDetails', {
            alertId: params.alertId as string | undefined,
          });
          return;
        }

        // safeher://sos (legacy)
        if (path === 'sos' || params.type === 'sos') {
          navigate('GuardianDashboard');
          return;
        }
      } catch (e) {
        console.warn('[DeepLink] Failed to parse deep link', e);
      }
    };

    // Handle notification taps (expo-notifications)
    let notifSub: any = null;
    try {
      const Notifications = require('expo-notifications');
      notifSub = Notifications.addNotificationResponseReceivedListener(
        (response: any) => {
          const data = response?.notification?.request?.content?.data ?? {};
          const notifType: string = data.type ?? data.screen ?? '';

          const navigate = (screen: string, params?: object) => {
            if (navigationRef.current) {
              // @ts-ignore
              navigationRef.current.navigate(screen, params);
            }
          };

          if (
            notifType === 'guardian' ||
            notifType === 'journey_started' ||
            notifType === 'journey_check_in' ||
            notifType === 'ward_alert' ||
            notifType === 'sos' ||
            notifType === 'safe_window'
          ) {
            if (data.alertId || data.alert_id || data.journeyId || data.journey_id) {
              navigate('GuardianAlertDetails', {
                alertId: data.alertId ?? data.alert_id,
                journeyId: data.journeyId ?? data.journey_id,
              });
            } else {
              navigate('GuardianDashboard');
            }
            return;
          }

          if (notifType === 'family' || notifType === 'family_location') {
            navigate('FamilyLiveMap', {
              familyId: data.familyId ?? data.family_id,
            });
            return;
          }

          if (notifType === 'alert' || notifType === 'alert_details') {
            navigate('GuardianAlertDetails', {
              alertId: data.alertId ?? data.alert_id,
            });
            return;
          }
        },
      );
    } catch (e) {
      // expo-notifications may not be available in all environments
      console.log('[Notifications] Response listener skipped:', e);
    }

    const urlSubscription = Linking.addEventListener('url', handleDeepLink);
    
    Linking.getInitialURL().then((url: string | null) => {
      if (url) handleDeepLink({ url });
    });

    return () => {
      active = false;
      subscription.unsubscribe();
      urlSubscription.remove();
      if (notifSub?.remove) notifSub.remove();
    };
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FAFAF9' }}>
        <ActivityIndicator size="large" color="#EF4444" />
      </View>
    ); 
  }

  return (
    <Stack.Navigator
      initialRouteName={session ? (profileStatus === 'ACTIVE' ? "MainTabs" : "ProfileRepair") : "Login"}
      screenOptions={{
        headerStyle: {
          backgroundColor: '#FFF7F7',
        },
        headerTintColor: '#111827',
        headerTitleStyle: {
          fontWeight: 'bold',
        },
      }}
    >
      {!session ? (
        <Stack.Screen 
          name="Login" 
          component={LoginScreen} 
          options={{ headerShown: false }} 
        />
      ) : profileStatus !== 'ACTIVE' ? (
        <Stack.Screen 
          name="ProfileRepair" 
          component={ProfileRepairScreen} 
          options={{ headerShown: false, title: 'Setup Required' }} 
        />
      ) : (
        <>
          <Stack.Screen 
            name="MainTabs" 
            component={MainTabs} 
            options={{ headerShown: false }} 
          />
          <Stack.Screen name="SOS" component={SOSScreen} options={{ title: 'Manual SOS' }} />
          <Stack.Screen name="SilentSOS" component={SilentSOSScreen} options={{ title: 'Silent SOS' }} />
          <Stack.Screen name="Contacts" component={ContactsScreen} options={{ title: 'Emergency Contacts' }} />
          <Stack.Screen name="SafeWindow" component={SafeWindowScreen} options={{ title: 'Safe Window' }} />
          <Stack.Screen name="DeadManCheckIn" component={DeadManCheckInScreen} options={{ title: 'Dead Man Check-in' }} />
          <Stack.Screen name="AlertHistory" component={AlertHistoryScreen} options={{ title: 'Alert History' }} />
          <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
          <Stack.Screen name="GuardianDashboard" component={GuardianDashboardScreen} options={{ title: 'Guardian Command Center' }} />
          <Stack.Screen name="GuardianAlertDetails" component={GuardianAlertDetailsScreen} options={{ title: 'Alert Details', headerStyle: { backgroundColor: '#FEF2F2' } }} />
          <Stack.Screen name="GuardianPersonDetail" component={GuardianPersonDetailScreen} options={{ title: 'Protected Person' }} />
          <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ title: 'Notifications' }} />
          
          {/* Family Screens */}
          {/* FamilyDashboard must be registered in the Stack so navigate('FamilyDashboard') works
              from anywhere, even though it is also the FamilyTab content in MainTabs. */}
          <Stack.Screen name="FamilyDashboard" component={FamilyDashboardScreen} options={{ title: 'Family', headerShown: false }} />
          <Stack.Screen name="FamilyLiveMap" component={FamilyLiveMapScreen} options={{ title: 'Family Live Map' }} />
          <Stack.Screen name="FamilyMembers" component={FamilyMembersScreen} options={{ title: 'Manage Members' }} />
          <Stack.Screen name="FamilySettings" component={FamilySettingsScreen} options={{ title: 'Family Settings' }} />
          <Stack.Screen name="JoinFamily" component={JoinFamilyScreen} options={{ headerShown: false }} />
          <Stack.Screen name="CreateFamily" component={CreateFamilyScreen} options={{ headerShown: false }} />
          <Stack.Screen name="LocationPicker" component={LocationPickerScreen} options={{ headerShown: false }} />
        </>
      )}
    </Stack.Navigator>
  );
};
