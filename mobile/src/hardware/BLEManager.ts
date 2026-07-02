import { BleManager, Device, BleError, Characteristic } from 'react-native-ble-plx';
import { Platform, PermissionsAndroid } from 'react-native';

const RING_SERVICE_UUID = '19b10000-e8f2-537e-4f6c-d104768a1214';
const RING_TX_UUID = '19b10001-e8f2-537e-4f6c-d104768a1214'; // ESP32 -> Phone
const RING_RX_UUID = '19b10002-e8f2-537e-4f6c-d104768a1214'; // Phone -> ESP32

type ConnectionStateChangeCallback = (isConnected: boolean) => void;
type MessageReceivedCallback = (message: string) => void;

class BLEManagerService {
  private manager: BleManager;
  private connectedDevice: Device | null = null;
  
  private onConnectionStateChange?: ConnectionStateChangeCallback;
  private onMessageReceived?: MessageReceivedCallback;

  constructor() {
    this.manager = new BleManager();
  }

  setCallbacks(onConnectChange: ConnectionStateChangeCallback, onMsg: MessageReceivedCallback) {
    this.onConnectionStateChange = onConnectChange;
    this.onMessageReceived = onMsg;
  }

  async requestPermissions(): Promise<boolean> {
    if (Platform.OS === 'android') {
      const apiLevel = parseInt(Platform.Version.toString(), 10);

      if (apiLevel < 31) {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      }
      if (apiLevel >= 31) {
        const res = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ]);
        return (
          res[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === PermissionsAndroid.RESULTS.GRANTED &&
          res[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === PermissionsAndroid.RESULTS.GRANTED
        );
      }
    }
    return true; // iOS permissions are handled via Info.plist / Expo config
  }

  async startScanning() {
    const hasPermission = await this.requestPermissions();
    if (!hasPermission) {
      console.warn('Bluetooth permissions not granted');
      return;
    }

    this.manager.startDeviceScan(
      [RING_SERVICE_UUID], 
      null, 
      (error, device) => {
        if (error) {
          console.error('Scan error:', error);
          return;
        }

        if (device && device.name === 'SafeHer Ring') {
          this.manager.stopDeviceScan();
          this.connectToDevice(device);
        }
      }
    );
  }

  private monitorSubscription: any = null;

  private async connectToDevice(device: Device) {
    try {
      const connected = await device.connect();
      await connected.discoverAllServicesAndCharacteristics();
      this.connectedDevice = connected;
      
      this.onConnectionStateChange?.(true);

      // Start listening to notifications
      this.monitorSubscription = connected.monitorCharacteristicForService(
        RING_SERVICE_UUID,
        RING_TX_UUID,
        (error: BleError | null, characteristic: Characteristic | null) => {
          if (error) {
            console.error('Monitor error:', error);
            return;
          }
          if (characteristic?.value) {
            // BLE payload is Base64 encoded, decode it
            try {
              const decoded = Buffer.from(characteristic.value, 'base64').toString('utf8');
              this.onMessageReceived?.(decoded);
            } catch (e) {
              // Ignore decode errors
            }
          }
        }
      );

      // Monitor disconnects
      connected.onDisconnected(() => {
        if (this.monitorSubscription) {
          this.monitorSubscription.remove();
          this.monitorSubscription = null;
        }
        this.connectedDevice = null;
        this.onConnectionStateChange?.(false);
        // Automatically try to reconnect
        setTimeout(() => this.startScanning(), 5000);
      });

    } catch (e) {
      console.error('Connection failed', e);
      setTimeout(() => this.startScanning(), 5000);
    }
  }

  async sendMessage(message: string) {
    if (!this.connectedDevice) return;
    try {
      const encoded = Buffer.from(message).toString('base64');
      await this.connectedDevice.writeCharacteristicWithResponseForService(
        RING_SERVICE_UUID,
        RING_RX_UUID,
        encoded
      );
    } catch (e) {
      console.error('Failed to send message to ring:', e);
    }
  }

  disconnect() {
    if (this.connectedDevice) {
      this.manager.cancelDeviceConnection(this.connectedDevice.id);
    }
  }
}

export const bleManagerService = new BLEManagerService();
