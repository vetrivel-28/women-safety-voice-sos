import { useEffect } from 'react';
import { Alert } from 'react-native';
import { useAlert } from '../context/AlertContext';
import { ringService } from './RingService';

export function useRingSOS() {
  const { createAlert } = useAlert();

  useEffect(() => {
    const unsubscribe = ringService.subscribe((event) => {
      if (event === 'SOS') {
        createAlert({
          triggerType: 'HARDWARE_SOS',
          status: 'ACTIVE',
          visibleMessage: 'SOS Triggered from SafeHer Ring',
          cancelMethod: 'REAL_PIN',
        })
          .then(() => {
            // Send ACK to ring after SOS alert is created successfully
            ringService.sendAcknowledge();
          })
          .catch((err) => {
            console.error('Failed to create alert from ring:', err);

            Alert.alert(
              'SOS Failed',
              'Failed to dispatch SOS from Ring. Please try again.'
            );
          });
      }
    });

    return () => {
      unsubscribe();
    };
  }, [createAlert]);
}