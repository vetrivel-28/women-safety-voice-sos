import React from 'react';
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

const Stack = createNativeStackNavigator<RootStackParamList>();

export const AppNavigator = () => {
  return (
    <Stack.Navigator
      initialRouteName="Home"
      screenOptions={{
        headerStyle: {
          backgroundColor: '#FFF7F7',
        },
        headerTintColor: '#111827',
        headerTitleStyle: {
          fontWeight: 'bold',
        },
        headerBackTitleVisible: false,
      }}
    >
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
    </Stack.Navigator>
  );
};
