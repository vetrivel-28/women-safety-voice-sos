import 'react-native-gesture-handler';
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { AppNavigator, navigationRef } from './src/navigation/AppNavigator';
import { AlertProvider } from './src/context/AlertContext';
import { ContactsProvider } from './src/context/ContactsContext';
import { SafeWindowProvider } from './src/context/SafeWindowContext';
import { NotificationProvider } from './src/context/NotificationContext';
import { FamilyProvider } from './src/context/FamilyContext';
import { MapProvider } from './src/context/MapContext';
import { RingProvider } from './src/hardware/RingContext';
import { useRingSOS } from './src/hardware/useRing';

// A component to run hardware ring hooks inside AlertProvider
function HardwareRingController() {
  useRingSOS();
  return null;
}

export default function App() {
  return (
    <MapProvider>
      <RingProvider>
        <AlertProvider>
          <ContactsProvider>
            <SafeWindowProvider>
              <NotificationProvider>
                <FamilyProvider>
                  <NavigationContainer ref={navigationRef}>
                    <HardwareRingController />
                    <AppNavigator />
                  </NavigationContainer>
                </FamilyProvider>
              </NotificationProvider>
            </SafeWindowProvider>
          </ContactsProvider>
        </AlertProvider>
      </RingProvider>
    </MapProvider>
  );
}