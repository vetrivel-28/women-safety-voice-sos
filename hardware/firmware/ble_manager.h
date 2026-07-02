#ifndef BLE_MANAGER_H
#define BLE_MANAGER_H

#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

class BLEManager {
public:
    typedef void (*RxCallback)(const std::string& rxValue);

    // Initialize the BLE subsystem
    void begin();
    
    // Send a notification to the connected client
    void notifyClient(const std::string& message);
    
    // Register callback for data written to the RX characteristic
    void setRxCallback(RxCallback cb);
    
    // Check if a client is connected
    bool isConnected();
    
    // Check connection state and handle re-advertising if needed
    void update();

private:
    BLEServer* _pServer = nullptr;
    BLECharacteristic* _pTxCharacteristic = nullptr;
    BLECharacteristic* _pRxCharacteristic = nullptr;
    
    bool _deviceConnected = false;
    bool _oldDeviceConnected = false;
    
    RxCallback _rxCallback = nullptr;

    // Callbacks classes need to be friends or we use static wrappers
    class ServerCallbacks;
    class CharacteristicCallbacks;
    
    friend class ServerCallbacks;
    friend class CharacteristicCallbacks;
};

#endif // BLE_MANAGER_H
