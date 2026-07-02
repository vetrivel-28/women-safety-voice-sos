#ifndef BUTTON_MANAGER_H
#define BUTTON_MANAGER_H

#include <Arduino.h>

class ButtonManager {
public:
    // Typedef for the callback function
    typedef void (*ButtonCallback)(uint8_t pressType);
    
    // Constants for press types
    static const uint8_t PRESS_SINGLE = 1;
    static const uint8_t PRESS_DOUBLE = 2;
    static const uint8_t PRESS_LONG = 3;

    // Constructor
    ButtonManager(uint8_t pin);
    
    // Initialize the button pin
    void begin();
    
    // Main update loop for checking button state
    void update();
    
    // Set the callback for button events
    void setCallback(ButtonCallback cb);

private:
    uint8_t _pin;
    ButtonCallback _callback;
    
    bool _lastState;
    bool _currentState;
    unsigned long _lastDebounceTime;
    unsigned long _pressStartTime;
    
    bool _isPressed;
    bool _longPressEmitted;
};

#endif // BUTTON_MANAGER_H
