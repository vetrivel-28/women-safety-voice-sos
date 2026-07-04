import {
  BleManager,
  Device,
  BleError,
  Characteristic,
  Subscription,
} from 'react-native-ble-plx';

import {
  Platform,
  PermissionsAndroid,
} from 'react-native';

import { Buffer } from 'buffer';

const RING_SERVICE_UUID =
  '19b10000-e8f2-537e-4f6c-d104768a1214';

const RING_TX_UUID =
  '19b10001-e8f2-537e-4f6c-d104768a1214'; // ESP32 -> Phone

const RING_RX_UUID =
  '19b10002-e8f2-537e-4f6c-d104768a1214'; // Phone -> ESP32

type ConnectionStateChangeCallback =
  (isConnected: boolean) => void;

type MessageReceivedCallback =
  (message: string) => void;

class BLEManagerService {
  private manager: BleManager;

  private connectedDevice: Device | null = null;

  private monitorSubscription: Subscription | null = null;

  private disconnectSubscription: Subscription | null = null;

  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  private isScanning = false;

  private isConnecting = false;

  private manualDisconnect = false;

  // Each new scan gets a unique generation number.
  // Old scan callbacks are ignored.
  private scanGeneration = 0;

  // Each connection attempt gets a unique generation number.
  // Old connection/disconnect callbacks are ignored.
  private connectionGeneration = 0;

  private onConnectionStateChange?: ConnectionStateChangeCallback;

  private onMessageReceived?: MessageReceivedCallback;

  constructor() {
    console.log('[BLE] Creating BleManager');

    this.manager = new BleManager();
  }

  setCallbacks(
    onConnectChange: ConnectionStateChangeCallback,
    onMsg: MessageReceivedCallback
  ): void {
    this.onConnectionStateChange = onConnectChange;
    this.onMessageReceived = onMsg;

    console.log('[BLE] Callbacks registered');
  }

  async requestPermissions(): Promise<boolean> {
    console.log('[BLE] Requesting permissions');

    if (Platform.OS !== 'android') {
      console.log(
        '[BLE] Non-Android platform, continuing'
      );

      return true;
    }

    const apiLevel = Number(Platform.Version);

    console.log(
      '[BLE] Android API level:',
      apiLevel
    );

    if (apiLevel < 31) {
      const granted =
        await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
        );

      const allowed =
        granted === PermissionsAndroid.RESULTS.GRANTED;

      console.log(
        '[BLE] Location permission granted:',
        allowed
      );

      return allowed;
    }

    const permissions = [
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    ];

    const result =
      await PermissionsAndroid.requestMultiple(
        permissions
      );

    const scanGranted =
      result[
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN
      ] === PermissionsAndroid.RESULTS.GRANTED;

    const connectGranted =
      result[
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT
      ] === PermissionsAndroid.RESULTS.GRANTED;

    console.log(
      '[BLE] BLUETOOTH_SCAN granted:',
      scanGranted
    );

    console.log(
      '[BLE] BLUETOOTH_CONNECT granted:',
      connectGranted
    );

    return scanGranted && connectGranted;
  }

  async startScanning(): Promise<void> {
    console.log('[BLE] startScanning called');

    this.manualDisconnect = false;

    if (this.connectedDevice) {
      console.log(
        '[BLE] Already connected to:',
        this.getDeviceName(this.connectedDevice)
      );

      return;
    }

    if (this.isConnecting) {
      console.log(
        '[BLE] Connection already in progress'
      );

      return;
    }

    if (this.isScanning) {
      console.log(
        '[BLE] Scan already running'
      );

      return;
    }

    const hasPermission =
      await this.requestPermissions();

    console.log(
      '[BLE] Permissions granted:',
      hasPermission
    );

    if (!hasPermission) {
      console.warn(
        '[BLE] Bluetooth permissions not granted'
      );

      return;
    }

    // Permission request is asynchronous.
    // Re-check state before actually starting scan.
    if (this.connectedDevice) {
      console.log(
        '[BLE] Device connected while permissions were resolving'
      );

      return;
    }

    if (this.isConnecting || this.isScanning) {
      console.log(
        '[BLE] BLE operation already started while permissions were resolving'
      );

      return;
    }

    this.clearReconnectTimer();

    this.isScanning = true;

    // New scan invalidates every previous scan callback.
    const currentScanGeneration =
      ++this.scanGeneration;

    console.log(
      '[BLE] Starting scan generation:',
      currentScanGeneration
    );

    console.log(
      '[BLE] Starting scan for service:',
      RING_SERVICE_UUID
    );

    this.manager.startDeviceScan(
      [RING_SERVICE_UUID],
      null,
      (error, device) => {
        // Ignore callbacks belonging to an old scan.
        if (
          currentScanGeneration !==
          this.scanGeneration
        ) {
          return;
        }

        // Ignore callbacks after scan was stopped.
        if (!this.isScanning) {
          return;
        }

        if (error) {
          console.error(
            '[BLE] Scan error:',
            error
          );

          this.stopScanning(
            currentScanGeneration
          );

          this.scheduleReconnect();

          return;
        }

        if (!device) {
          return;
        }

        const deviceName =
          this.getDeviceName(device);

        console.log(
          '[BLE] Device found:',
          {
            name: device.name,
            localName: device.localName,
            normalizedName: deviceName,
            id: device.id,
            rssi: device.rssi,
          }
        );

        const isSafeHerRing =
          deviceName === 'SafeHer' ||
          deviceName === 'SafeHer Ring';

        if (!isSafeHerRing) {
          return;
        }

        console.log(
          '[BLE] SafeHer Ring matched'
        );

        // Critical:
        // Set flags and invalidate callbacks BEFORE connecting.
        this.stopScanning(
          currentScanGeneration
        );

        if (
          this.connectedDevice ||
          this.isConnecting
        ) {
          console.log(
            '[BLE] Match ignored because connection already exists or is starting'
          );

          return;
        }

        console.log(
          '[BLE] Scan stopped, starting single connection attempt'
        );

        void this.connectToDevice(device);
      }
    );
  }

  private stopScanning(
    expectedGeneration?: number
  ): void {
    if (
      expectedGeneration !== undefined &&
      expectedGeneration !== this.scanGeneration
    ) {
      return;
    }

    // Invalidate queued callbacks immediately.
    this.scanGeneration++;

    if (!this.isScanning) {
      return;
    }

    this.isScanning = false;

    try {
      this.manager.stopDeviceScan();

      console.log(
        '[BLE] Device scan stopped'
      );
    } catch (error) {
      console.warn(
        '[BLE] Failed to stop scan cleanly:',
        error
      );
    }
  }

  private async connectToDevice(
    device: Device
  ): Promise<void> {
    if (this.connectedDevice) {
      console.log(
        '[BLE] Connection skipped, already connected'
      );

      return;
    }

    if (this.isConnecting) {
      console.log(
        '[BLE] Connection skipped, attempt already active'
      );

      return;
    }

    this.clearReconnectTimer();

    this.isConnecting = true;

    const currentConnectionGeneration =
      ++this.connectionGeneration;

    const deviceName =
      this.getDeviceName(device);

    console.log(
      '[BLE] Connection generation:',
      currentConnectionGeneration
    );

    console.log(
      '[BLE] Connecting to device:',
      deviceName
    );

    try {
      const connected =
        await device.connect();

      // A newer connection attempt superseded this one.
      if (
        currentConnectionGeneration !==
        this.connectionGeneration
      ) {
        console.warn(
          '[BLE] Ignoring stale connection result'
        );

        try {
          await this.manager.cancelDeviceConnection(
            connected.id
          );
        } catch {
          // Ignore stale cleanup errors.
        }

        return;
      }

      console.log(
        '[BLE] Physical BLE connection established'
      );

      console.log(
        '[BLE] Discovering services and characteristics'
      );

      const discovered =
        await connected
          .discoverAllServicesAndCharacteristics();

      if (
        currentConnectionGeneration !==
        this.connectionGeneration
      ) {
        console.warn(
          '[BLE] Ignoring stale service discovery result'
        );

        return;
      }

      console.log(
        '[BLE] Service discovery complete'
      );

      this.connectedDevice = discovered;

      this.isConnecting = false;

      this.clearReconnectTimer();

      this.onConnectionStateChange?.(true);

      console.log(
        '[BLE] Connection state set to connected'
      );

      this.removeMonitorSubscription();

      console.log(
        '[BLE] Subscribing to NOTIFY characteristic:',
        RING_TX_UUID
      );

      this.monitorSubscription =
        discovered.monitorCharacteristicForService(
          RING_SERVICE_UUID,
          RING_TX_UUID,
          (
            error: BleError | null,
            characteristic: Characteristic | null
          ) => {
            // Ignore monitor events from an old connection.
            if (
              currentConnectionGeneration !==
              this.connectionGeneration
            ) {
              return;
            }

            if (error) {
              console.error(
                '[BLE] Monitor error:',
                error
              );

              return;
            }

            if (!characteristic?.value) {
              return;
            }

            try {
              const decoded = Buffer
                .from(
                  characteristic.value,
                  'base64'
                )
                .toString('utf8')
                .trim();

              console.log(
                '[BLE] Message received:',
                decoded
              );

              this.onMessageReceived?.(
                decoded
              );
            } catch (error) {
              console.error(
                '[BLE] Failed to decode notification:',
                error
              );
            }
          }
        );

      this.removeDisconnectSubscription();

      this.disconnectSubscription =
        discovered.onDisconnected(
          (
            error,
            disconnectedDevice
          ) => {
            // Ignore disconnect callback from an old connection.
            if (
              currentConnectionGeneration !==
              this.connectionGeneration
            ) {
              console.log(
                '[BLE] Ignoring stale disconnect callback'
              );

              return;
            }

            console.warn(
              '[BLE] Device disconnected:',
              disconnectedDevice.id
            );

            if (error) {
              console.error(
                '[BLE] Disconnect error:',
                error
              );
            }

            this.removeMonitorSubscription();

            this.connectedDevice = null;

            this.isConnecting = false;

            this.onConnectionStateChange?.(
              false
            );

            // Invalidate this connection's remaining callbacks.
            this.connectionGeneration++;

            if (this.manualDisconnect) {
              console.log(
                '[BLE] Manual disconnect, reconnect suppressed'
              );

              return;
            }

            this.scheduleReconnect();
          }
        );

      console.log(
        '[BLE] SafeHer Ring fully ready'
      );
    } catch (error) {
      // Ignore failure from an obsolete attempt.
      if (
        currentConnectionGeneration !==
        this.connectionGeneration
      ) {
        console.log(
          '[BLE] Ignoring stale connection failure'
        );

        return;
      }

      console.error(
        '[BLE] Connection failed:',
        error
      );

      this.connectedDevice = null;

      this.isConnecting = false;

      this.onConnectionStateChange?.(false);

      this.connectionGeneration++;

      if (!this.manualDisconnect) {
        this.scheduleReconnect();
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.manualDisconnect) {
      console.log(
        '[BLE] Reconnect not scheduled because disconnect was manual'
      );

      return;
    }

    if (this.connectedDevice) {
      console.log(
        '[BLE] Reconnect not scheduled because device is connected'
      );

      return;
    }

    if (this.isConnecting) {
      console.log(
        '[BLE] Reconnect not scheduled because connection is active'
      );

      return;
    }

    this.clearReconnectTimer();

    console.log(
      '[BLE] Scheduling reconnect in 5 seconds'
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;

      if (this.manualDisconnect) {
        return;
      }

      if (
        this.connectedDevice ||
        this.isConnecting ||
        this.isScanning
      ) {
        console.log(
          '[BLE] Reconnect timer skipped because BLE is already active'
        );

        return;
      }

      console.log(
        '[BLE] Reconnect timer fired'
      );

      void this.startScanning();
    }, 5000);
  }

  private clearReconnectTimer(): void {
    if (!this.reconnectTimer) {
      return;
    }

    clearTimeout(this.reconnectTimer);

    this.reconnectTimer = null;

    console.log(
      '[BLE] Pending reconnect timer cleared'
    );
  }

  private removeMonitorSubscription(): void {
    if (!this.monitorSubscription) {
      return;
    }

    try {
      this.monitorSubscription.remove();
    } catch {
      // Ignore cleanup error.
    }

    this.monitorSubscription = null;
  }

  private removeDisconnectSubscription(): void {
    if (!this.disconnectSubscription) {
      return;
    }

    try {
      this.disconnectSubscription.remove();
    } catch {
      // Ignore cleanup error.
    }

    this.disconnectSubscription = null;
  }

  private getDeviceName(
    device: Device
  ): string {
    return (
      device.name ??
      device.localName ??
      ''
    ).trim();
  }

  async sendMessage(
    message: string
  ): Promise<void> {
    const device = this.connectedDevice;

    if (!device) {
      console.warn(
        '[BLE] Cannot send message, no ring connected'
      );

      return;
    }

    try {
      console.log(
        '[BLE] Sending message:',
        message
      );

      const encoded = Buffer
        .from(message, 'utf8')
        .toString('base64');

      await device
        .writeCharacteristicWithResponseForService(
          RING_SERVICE_UUID,
          RING_RX_UUID,
          encoded
        );

      console.log(
        '[BLE] Message sent successfully:',
        message
      );
    } catch (error) {
      console.error(
        '[BLE] Failed to send message to ring:',
        error
      );
    }
  }

  async disconnect(): Promise<void> {
    console.log(
      '[BLE] Manual disconnect requested'
    );

    this.manualDisconnect = true;

    this.clearReconnectTimer();

    // Invalidate all old callbacks.
    this.scanGeneration++;
    this.connectionGeneration++;

    if (this.isScanning) {
      try {
        this.manager.stopDeviceScan();
      } catch {
        // Ignore cleanup error.
      }

      this.isScanning = false;
    }

    this.removeMonitorSubscription();

    this.removeDisconnectSubscription();

    const device = this.connectedDevice;

    this.connectedDevice = null;

    this.isConnecting = false;

    this.onConnectionStateChange?.(false);

    if (!device) {
      console.log(
        '[BLE] No connected device to disconnect'
      );

      return;
    }

    try {
      await this.manager
        .cancelDeviceConnection(
          device.id
        );

      console.log(
        '[BLE] Device disconnected manually'
      );
    } catch (error) {
      console.error(
        '[BLE] Manual disconnect failed:',
        error
      );
    }
  }
}

export const bleManagerService =
  new BLEManagerService();