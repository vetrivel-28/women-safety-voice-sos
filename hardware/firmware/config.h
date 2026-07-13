#ifndef CONFIG_H
#define CONFIG_H

// Pin Definitions for ESP32-C3 Super Mini
#define PIN_LED 8        // Internal LED is usually on GPIO 8 for ESP32-C3
#define PIN_BUTTON 9      // External Push Button connected to GPIO 9
#define PIN_VIBRATION 10 // Base of 2N2222A connected to GPIO 10 via 1k resistor

// BLE Configuration
#define DEVICE_NAME "SafeHer Ring"
#define SERVICE_UUID "19b10000-e8f2-537e-4f6c-d104768a1214"
#define CHARACTERISTIC_UUID_TX "19b10001-e8f2-537e-4f6c-d104768a1214" // ESP32 -> Phone (Notify)
#define CHARACTERISTIC_UUID_RX "19b10002-e8f2-537e-4f6c-d104768a1214" // Phone -> ESP32 (Write)

// Timing Constants
#define DEBOUNCE_DELAY_MS 50
#define LONG_PRESS_DELAY_MS 2000

#endif // CONFIG_H
