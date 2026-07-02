#include "ble_manager.h"
#include "config.h"

// --- Callback Classes ---

class ServerCallbacks: public BLEServerCallbacks {
    BLEManager* _manager;
public:
    ServerCallbacks(BLEManager* manager) : _manager(manager) {}
    void onConnect(BLEServer* pServer) {
        _manager->_deviceConnected = true;
    }
    void onDisconnect(BLEServer* pServer) {
        _manager->_deviceConnected = false;
    }
};

class CharacteristicCallbacks: public BLECharacteristicCallbacks {
    BLEManager* _manager;
public:
    CharacteristicCallbacks(BLEManager* manager) : _manager(manager) {}
    void onWrite(BLECharacteristic *pCharacteristic) {
        std::string rxValue = pCharacteristic->getValue();
        if (rxValue.length() > 0 && _manager->_rxCallback) {
            _manager->_rxCallback(rxValue);
        }
    }
};

// --- BLEManager Implementation ---

void BLEManager::begin() {
    BLEDevice::init(DEVICE_NAME);

    // Create the BLE Server
    _pServer = BLEDevice::createServer();
    _pServer->setCallbacks(new ServerCallbacks(this));

    // Create the BLE Service
    BLEService *pService = _pServer->createService(SERVICE_UUID);

    // Create a BLE Characteristic for TX (ESP32 -> Phone)
    _pTxCharacteristic = pService->createCharacteristic(
        CHARACTERISTIC_UUID_TX,
        BLECharacteristic::PROPERTY_NOTIFY
    );
    _pTxCharacteristic->addDescriptor(new BLE2902());

    // Create a BLE Characteristic for RX (Phone -> ESP32)
    _pRxCharacteristic = pService->createCharacteristic(
        CHARACTERISTIC_UUID_RX,
        BLECharacteristic::PROPERTY_WRITE
    );
    _pRxCharacteristic->setCallbacks(new CharacteristicCallbacks(this));

    // Start the service
    pService->start();

    // Start advertising
    BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
    pAdvertising->addServiceUUID(SERVICE_UUID);
    pAdvertising->setScanResponse(false);
    pAdvertising->setMinPreferred(0x0); // set value to 0x00 to not advertise this parameter
    BLEDevice::startAdvertising();
}

void BLEManager::setRxCallback(RxCallback cb) {
    _rxCallback = cb;
}

void BLEManager::notifyClient(const std::string& message) {
    if (_deviceConnected && _pTxCharacteristic) {
        _pTxCharacteristic->setValue(message);
        _pTxCharacteristic->notify();
    }
}

bool BLEManager::isConnected() {
    return _deviceConnected;
}

void BLEManager::update() {
    // disconnecting
    if (!_deviceConnected && _oldDeviceConnected) {
        delay(500); // give the bluetooth stack the chance to get things ready
        _pServer->startAdvertising(); // restart advertising
        _oldDeviceConnected = _deviceConnected;
    }
    
    // connecting
    if (_deviceConnected && !_oldDeviceConnected) {
        // do stuff here on connecting
        _oldDeviceConnected = _deviceConnected;
    }
}
