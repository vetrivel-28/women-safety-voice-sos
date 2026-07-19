import { useEffect } from 'react';
import { Alert } from 'react-native';
import { useAlert } from '../context/AlertContext';
import { ringService } from './RingService';

export function useRingSOS() {
  const { createAlert } = useAlert();

  useEffect(() => {


    // Start scanning for the SafeHer Ring
    ringService.connect();

    // Subscribe to messages received from the ring
    const unsubscribe = ringService.subscribe((event) => {


      if (event === 'SOS') {


        createAlert({
          triggerType: 'HARDWARE_SOS',
          status: 'ACTIVE',
          visibleMessage: 'SOS Triggered from SafeHer Ring',
          cancelMethod: 'REAL_PIN',
        })
          .then(() => {

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

      unsubscribe();
    };
  }, [createAlert]);
}