import { bleManagerService } from './BLEManager';

export type RingEventHandler = (event: 'SOS' | 'BATTERY_LOW' | string) => void;

class RingService {
  private eventHandlers: Set<RingEventHandler> = new Set();
  
  constructor() {
    bleManagerService.setCallbacks(
      this.handleConnectionChange.bind(this),
      this.handleMessage.bind(this)
    );
  }

  private handleConnectionChange(isConnected: boolean) {
    // We can emit internal events if needed, but Context handles the state
  }

  private handleMessage(message: string) {
    if (message === 'SOS') {
      this.notifyHandlers('SOS');
    }
  }

  public subscribe(handler: RingEventHandler) {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  private notifyHandlers(event: string) {
    this.eventHandlers.forEach(handler => handler(event));
  }

  public connect() {
    bleManagerService.startScanning();
  }

  public disconnect() {
    bleManagerService.disconnect();
  }

  public sendAcknowledge() {
    bleManagerService.sendMessage('ACK');
  }
}

export const ringService = new RingService();
