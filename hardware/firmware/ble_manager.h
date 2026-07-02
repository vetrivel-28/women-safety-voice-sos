#ifndef BLE_MANAGER_H
#define BLE_MANAGER_H

#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

class BLEManager {
public:
    typedef void (*RxCallback)(const String& rxValue);

    // Initialize the BLE subsystem
    void begin();
    
    // Send a notification to the connected client
    void notifyClient(const String& message);
    
    // Register callback for data written to the RX characteristic
    void setRxCallback(RxCallback cb);
    
    // Check if a client is connected
    bool isConnected();
    
    // Check connection state and handle re-advertising if needed
    void update();

    // Callbacks access these (instead of complex friend declarations)
    void _setConnected(bool connected) { _deviceConnected = connected; }
    void _handleRx(const String& rxValue) { if (_rxCallback) _rxCallback(rxValue); }

private:
    BLEServer* _pServer = nullptr;
    BLECharacteristic* _pTxCharacteristic = nullptr;
    BLECharacteristic* _pRxCharacteristic = nullptr;
    
    bool _deviceConnected = false;
    bool _oldDeviceConnected = false;
    
    RxCallback _rxCallback = nullptr;
};

#endif // BLE_MANAGER_H
