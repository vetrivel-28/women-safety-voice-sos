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

    Serial.print(">>> BUTTON CALLBACK! Type: ");
    Serial.println(pressType);

    if (pressType == ButtonManager::PRESS_SINGLE ||
        pressType == ButtonManager::PRESS_LONG) {

        if (ble.isConnected()) {

            Serial.println("BLE Connected - Sending SOS");

            ble.notifyClient("SOS");

            led.blink(200);

        } else {

            Serial.println("BLE NOT Connected");

            static const uint16_t offlinePattern[] = {200,200,200,200};
            motor.vibratePattern(offlinePattern,4);
        }
    }
}

// Callback when data is received over BLE
void onBleRx(const String& rxValue) {

    Serial.print("Received Value: ");
    Serial.println(rxValue);

    if (rxValue.indexOf("ACK") != -1) {

        static const uint16_t ackPattern[] = {200,200,200,200};

        motor.vibratePattern(ackPattern,4);

        led.blink(600);
    }
}

void setup() {

    Serial.begin(115200);
    delay(1000);

    Serial.println();
    Serial.println("==============================");
    Serial.println(" SafeHer Ring Starting ");
    Serial.println("==============================");

    Serial.print("Button Pin = ");
    Serial.println(PIN_BUTTON);

    led.begin();
    button.begin();
    motor.begin();

    button.setCallback(onButtonPress);
    ble.setRxCallback(onBleRx);

    ble.begin();

    Serial.println("BLE Advertising Started");

    motor.vibrateShort();
    led.blink(500);
}

void loop() {

    // Debug GPIO every 500ms
    static unsigned long lastPrint = 0;

    if (millis() - lastPrint > 500) {

        lastPrint = millis();

        Serial.print("GPIO ");
        Serial.print(PIN_BUTTON);
        Serial.print(" = ");
        Serial.println(digitalRead(PIN_BUTTON));
    }

    button.update();
    ble.update();
    led.update();
    motor.update();

    delay(10);
}