#ifndef LED_MANAGER_H
#define LED_MANAGER_H

#include <Arduino.h>

class LEDManager {
public:
    // Constructor
    LEDManager(uint8_t pin);
    
    // Initialize the LED pin
    void begin();
    
    // Turn the LED on
    void on();
    
    // Turn the LED off
    void off();
    
    // Blink the LED for a specific duration
    void blink(uint16_t durationMs);

    // Update loop for non-blocking operations
    void update();

private:
    uint8_t _pin;
    bool _isBlinking;
    unsigned long _blinkStartTime;
    uint16_t _blinkDuration;
};

#endif // LED_MANAGER_H
