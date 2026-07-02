#include "vibration_manager.h"

VibrationManager::VibrationManager(uint8_t pin) : 
    _pin(pin), _isActive(false), _lastToggleTime(0),
    _currentPattern(nullptr), _patternLength(0), _patternIndex(0) {
    _shortPattern[0] = 200; _shortPattern[1] = 0;
    _longPattern[0] = 800;  _longPattern[1] = 0;
}

void VibrationManager::begin() {
    pinMode(_pin, OUTPUT);
    digitalWrite(_pin, LOW); // Default off
}

void VibrationManager::vibrateShort() {
    vibratePattern(_shortPattern, 1);
}

void VibrationManager::vibrateLong() {
    vibratePattern(_longPattern, 1);
}

void VibrationManager::vibratePattern(const uint16_t* pattern, uint8_t length) {
    if (pattern == nullptr || length == 0) return;
    _currentPattern = pattern;
    _patternLength = length;
    _patternIndex = 0;
    _isActive = true;
    _lastToggleTime = millis();
    digitalWrite(_pin, HIGH); // Pattern always starts ON
}

void VibrationManager::update() {
    if (!_isActive || _currentPattern == nullptr) {
        return;
    }

    unsigned long currentDuration = _currentPattern[_patternIndex];
    
    if (millis() - _lastToggleTime >= currentDuration) {
        _patternIndex++;
        
        if (_patternIndex >= _patternLength) {
            // Pattern finished
            _isActive = false;
            digitalWrite(_pin, LOW);
            _currentPattern = nullptr;
        } else {
            // Toggle state
            _lastToggleTime = millis();
            // Even index = ON, Odd index = OFF
            if (_patternIndex % 2 == 0) {
                digitalWrite(_pin, HIGH);
            } else {
                digitalWrite(_pin, LOW);
            }
        }
    }
}
