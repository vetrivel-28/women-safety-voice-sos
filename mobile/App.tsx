import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { AppNavigator } from './src/navigation/AppNavigator';
import { AlertProvider } from './src/context/AlertContext';
import { ContactsProvider } from './src/context/ContactsContext';

export default function App() {
  return (
    <AlertProvider>
      <ContactsProvider>
        <NavigationContainer>
          <AppNavigator />
        </NavigationContainer>
      </ContactsProvider>
    </AlertProvider>
  );
}