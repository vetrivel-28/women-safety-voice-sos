import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { AppNavigator, navigationRef } from './src/navigation/AppNavigator';
import { AlertProvider } from './src/context/AlertContext';
import { ContactsProvider } from './src/context/ContactsContext';
import { SafeWindowProvider } from './src/context/SafeWindowContext';
import { NotificationProvider } from './src/context/NotificationContext';
import { FamilyProvider } from './src/context/FamilyContext';

export default function App() {
  return (
    <AlertProvider>
      <ContactsProvider>
        <SafeWindowProvider>
          <NotificationProvider>
            <FamilyProvider>
              <NavigationContainer ref={navigationRef}>
                <AppNavigator />
              </NavigationContainer>
            </FamilyProvider>
          </NotificationProvider>
        </SafeWindowProvider>
      </ContactsProvider>
    </AlertProvider>
  );
}