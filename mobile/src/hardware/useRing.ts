import { useEffect } from 'react';
import { useAlert } from '../context/AlertContext';
import { ringService } from './RingService';
import { Alert } from 'react-native';

export function useRingSOS() {
  const { createAlert } = useAlert();

  useEffect(() => {
    const unsubscribe = ringService.subscribe((event) => {
      if (event === 'SOS') {
        // Create an alert on the phone
        createAlert({
          triggerType: 'HARDWARE_SOS',
          status: 'ACTIVE',
          visibleMessage: 'SOS Triggered from SafeHer Ring',
          cancelMethod: 'REAL_PIN'
        }).then(() => {
          // Send ACK to ring so it vibrates twice
          ringService.sendAcknowledge();
        }).catch(err => {
          console.error("Failed to create alert from ring:", err);
          Alert.alert("SOS Failed", "Failed to dispatch SOS from Ring. Please try again.");
        });
      }
    });

    return unsubscribe;
  }, [createAlert]);
}
