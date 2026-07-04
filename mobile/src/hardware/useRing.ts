import { useEffect } from 'react';
import { Alert } from 'react-native';
import { useAlert } from '../context/AlertContext';
import { ringService } from './RingService';

export function useRingSOS() {
  const { createAlert } = useAlert();

  useEffect(() => {
    console.log('[Ring] Starting BLE connection flow');

    // Start scanning for the SafeHer Ring
    ringService.connect();

    // Subscribe to messages received from the ring
    const unsubscribe = ringService.subscribe((event) => {
      console.log('[Ring] Event received:', event);

      if (event === 'SOS') {
        console.log('[Ring] Hardware SOS received');

        createAlert({
          triggerType: 'HARDWARE_SOS',
          status: 'ACTIVE',
          visibleMessage: 'SOS Triggered from SafeHer Ring',
          cancelMethod: 'REAL_PIN',
        })
          .then(() => {
            console.log('[Ring] SOS created successfully, sending ACK');
            return ringService.sendAcknowledge();
          })
          .catch((err) => {
            console.error('[Ring] Failed to create alert from ring:', err);

            Alert.alert(
              'SOS Failed',
              'Failed to dispatch SOS from Ring. Please try again.'
            );
          });
      }
    });

    return () => {
      console.log('[Ring] Cleaning up SOS subscription');
      unsubscribe();
    };
  }, [createAlert]);
}