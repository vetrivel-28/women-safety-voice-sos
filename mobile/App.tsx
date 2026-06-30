import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { AppNavigator } from './src/navigation/AppNavigator';
import { AlertProvider } from './src/context/AlertContext';
import { ContactsProvider } from './src/context/ContactsContext';
import { SafeWindowProvider } from './src/context/SafeWindowContext';
import { NotificationProvider } from './src/context/NotificationContext';

export default function App() {
  return (
    <AlertProvider>
      <ContactsProvider>
        <SafeWindowProvider>
          <NotificationProvider>
            <NavigationContainer>
              <AppNavigator />
            </NavigationContainer>
          </NotificationProvider>
        </SafeWindowProvider>
      </ContactsProvider>
    </AlertProvider>
  );
}