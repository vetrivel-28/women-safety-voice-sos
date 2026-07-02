#ifndef VIBRATION_MANAGER_H
#define VIBRATION_MANAGER_H

#include <Arduino.h>

class VibrationManager {
public:
    // Constructor
    VibrationManager(uint8_t pin);
    
    // Initialize the motor pin
    void begin();
    
    // Produce a short vibration (e.g. acknowledgment)
    void vibrateShort();
    
    // Produce a long vibration
    void vibrateLong();
    
    // Produce a custom pattern (array of timings [on, off, on, off...])
    // The pattern array must remain valid for the duration of the vibration
    void vibratePattern(const uint16_t* pattern, uint8_t length);
    
    // Update loop for non-blocking operations
    void update();

private:
    uint8_t _pin;
    bool _isActive;
    unsigned long _lastToggleTime;
    
    const uint16_t* _currentPattern;
    uint8_t _patternLength;
    uint8_t _patternIndex;
    
    // Built-in patterns
    uint16_t _shortPattern[2];
    uint16_t _longPattern[2];
};

#endif // VIBRATION_MANAGER_H
