import React from 'react';
import * as Linking from 'expo-linking';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';

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

const Stack = createNativeStackNavigator<RootStackParamList>();

export const AppNavigator = () => {
  const [session, setSession] = React.useState<Session | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    const handleDeepLink = async ({ url }: { url: string }) => {
      if (!url) return;
      const match = url.match(/#access_token=([^&]+)/);
      const refreshTokenMatch = url.match(/&refresh_token=([^&]+)/);
      
      if (match && refreshTokenMatch) {
        const access_token = match[1];
        const refresh_token = refreshTokenMatch[1];
        await supabase.auth.setSession({
          access_token,
          refresh_token,
        });
      }
    };

    const urlSubscription = Linking.addEventListener('url', handleDeepLink);
    
    Linking.getInitialURL().then((url: string | null) => {
      if (url) handleDeepLink({ url });
    });

    return () => {
      subscription.unsubscribe();
      urlSubscription.remove();
    };
  }, []);

  if (loading) {
    return null; // Or a simple loading screen
  }

  return (
    <Stack.Navigator
      initialRouteName={session ? "Home" : "Login"}
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
      ) : (
        <>
          <Stack.Screen 
            name="Home" 
            component={HomeScreen} 
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
        </>
      )}
    </Stack.Navigator>
  );
};
