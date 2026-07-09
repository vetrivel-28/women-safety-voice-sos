#include "button_manager.h"
#include "config.h"

ButtonManager::ButtonManager(uint8_t pin) : 
    _pin(pin), 
    _callback(nullptr),
    _lastState(HIGH),
    _currentState(HIGH),
    _lastDebounceTime(0),
    _pressStartTime(0),
    _isPressed(false),
    _longPressEmitted(false)
{}

void ButtonManager::begin() {
    pinMode(_pin, INPUT_PULLUP);
}

void ButtonManager::setCallback(ButtonCallback cb) {
    _callback = cb;
}

void ButtonManager::update() {
    // Read the state of the switch into a local variable:
    bool reading = digitalRead(_pin);

    // Check to see if you just pressed the button
    if (reading != _lastState) {
        // Reset the debouncing timer
        _lastDebounceTime = millis();
    }

    if ((millis() - _lastDebounceTime) > DEBOUNCE_DELAY_MS) {
        // Whatever the reading is at, it's been there for longer than the debounce
        // delay, so take it as the actual current state:

        if (reading != _currentState) {
            _currentState = reading;

            // Only trigger events on state change
            if (_currentState == LOW) {
                // Button is pressed (active low due to INPUT_PULLUP)
                _isPressed = true;
                _pressStartTime = millis();
                _longPressEmitted = false;
            } else {
                // Button is released
                if (_isPressed && !_longPressEmitted) {
                    // It was a short press
                    // Note: double press logic can be added here using a timer
                    if (_callback) {
                        _callback(PRESS_SINGLE);
                    }
                }
                _isPressed = false;
            }
        }
    }

    // Check for long press while button is held down
    if (_isPressed && !_longPressEmitted) {
        if ((millis() - _pressStartTime) > LONG_PRESS_DELAY_MS) {
            _longPressEmitted = true;
            if (_callback) {
                _callback(PRESS_LONG);
            }
        }
    }

    // Save the reading. Next time through the loop, it'll be the lastState:
    _lastState = reading;
}
