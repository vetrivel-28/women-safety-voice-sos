#include <Arduino.h>
#include "config.h"
#include "led_manager.h"
#include "button_manager.h"
#include "vibration_manager.h"
#include "ble_manager.h"

// Instantiate Managers
LEDManager led(PIN_LED);
ButtonManager button(PIN_BUTTON);
VibrationManager motor(PIN_VIBRATION);
BLEManager ble;

// Callback when button is pressed
void onButtonPress(uint8_t pressType) {
    if (pressType == ButtonManager::PRESS_SINGLE || pressType == ButtonManager::PRESS_LONG) {
        Serial.print("Button Pressed. Type: ");
        Serial.println(pressType);
        
        // Notify over BLE
        if (ble.isConnected()) {
            // Send SOS string, or specific command
            ble.notifyClient("SOS");
            
            // Give user immediate local feedback that press was registered
            led.blink(200);
        } else {
            // Not connected to phone, warn user
            static const uint16_t offlinePattern[] = {200, 200, 200, 200};
            motor.vibratePattern(offlinePattern, 4);
        }
    }
}

// Callback when data is received over BLE (e.g. from Phone)
void onBleRx(const std::string& rxValue) {
    Serial.print("Received Value: ");
    for (int i = 0; i < rxValue.length(); i++) {
        Serial.print(rxValue[i]);
    }
    Serial.println();

    // The app sends "ACK" when the SOS is processed
    if (rxValue.find("ACK") != std::string::npos) {
        // Vibrate twice to acknowledge successful SOS dispatch
        static const uint16_t ackPattern[] = {200, 200, 200, 200}; // On 200, Off 200, On 200, Off 200
        motor.vibratePattern(ackPattern, 4);
        
        // Flash LED twice (using simple sequence since LEDManager currently supports simple blink)
        // For a true double blink without blocking, we'd need to extend LEDManager.
        // For now, we accept a tiny blocking here, or just single blink.
        // Let's do a slightly longer single blink for acknowledgment without blocking
        led.blink(600);
    }
}

void setup() {
    Serial.begin(115200);
    Serial.println("SafeHer Ring starting up...");

    // Initialize all components
    led.begin();
    button.begin();
    motor.begin();

    // Set Callbacks
    button.setCallback(onButtonPress);
    ble.setRxCallback(onBleRx);

    // Initialize BLE
    ble.begin();
    
    Serial.println("Initialization complete. Advertising BLE...");
    
    // Initial startup feedback (short vibration and led blink)
    motor.vibrateShort();
    led.blink(500);
}

void loop() {
    // Update managers (handle debouncing, ble state, non-blocking timers)
    button.update();
    ble.update();
    led.update();
    motor.update();
    
    // Small delay to yield to FreeRTOS (required for watchdog)
    delay(10);
}
