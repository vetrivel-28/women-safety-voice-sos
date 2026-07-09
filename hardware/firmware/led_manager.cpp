#include "led_manager.h"

LEDManager::LEDManager(uint8_t pin) : _pin(pin), _isBlinking(false), _blinkStartTime(0), _blinkDuration(0) {}

void LEDManager::begin() {
    pinMode(_pin, OUTPUT);
    off(); // Default to off
}

void LEDManager::on() {
    digitalWrite(_pin, HIGH);
}

void LEDManager::off() {
    digitalWrite(_pin, LOW);
    _isBlinking = false;
}

void LEDManager::blink(uint16_t durationMs) {
    on();
    _isBlinking = true;
    _blinkStartTime = millis();
    _blinkDuration = durationMs;
}

void LEDManager::update() {
    if (_isBlinking) {
        if (millis() - _blinkStartTime >= _blinkDuration) {
            off();
        }
    }
}
