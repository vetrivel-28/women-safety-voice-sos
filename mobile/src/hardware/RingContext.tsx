import React, { createContext, useContext, useState, useEffect } from 'react';
import { ringService } from './RingService';
import { bleManagerService } from './BLEManager';

interface RingContextType {
  isConnected: boolean;
  connect: () => void;
  disconnect: () => void;
  sendAcknowledge: () => void;
}

const RingContext = createContext<RingContextType | undefined>(undefined);

export const RingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Override the callback to also update context state
    // Note: In a production app, use an EventEmitter rather than overriding singleton callbacks
    const originalCallback = (bleManagerService as any).onConnectionStateChange;
    bleManagerService.setCallbacks(
      (connected) => {
        setIsConnected(connected);
        if (originalCallback) originalCallback(connected);
      },
      (bleManagerService as any).onMessageReceived
    );
    
    // Auto-connect on mount
    ringService.connect();

    return () => {
      ringService.disconnect();
    };
  }, []);

  const connect = () => ringService.connect();
  const disconnect = () => ringService.disconnect();
  const sendAcknowledge = () => ringService.sendAcknowledge();

  return (
    <RingContext.Provider value={{ isConnected, connect, disconnect, sendAcknowledge }}>
      {children}
    </RingContext.Provider>
  );
};
