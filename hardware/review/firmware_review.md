# Firmware Review

## Summary
The firmware was reviewed for memory leaks, blocking delays, watchdog safety, and ESP32-C3 compatibility. Initially, several severe issues were discovered including blocking delays and a memory leak, which have been rectified.

## Review Items

| Item | Status | Notes |
| :--- | :--- | :--- |
| Compile Errors | PASS | No compile errors; syntax is standard C++11/14. |
| Memory Leaks | PASS | Fixed a memory leak in `main.ino` where `new uint16_t[]` was passed and never freed. Arrays are now static constants. |
| Heap Allocation | PASS | Minimized. Arrays are statically allocated in data segment. |
| Blocking Delays | PASS | Fixed `delay()` usage in `led_manager` and `vibration_manager`. They now use non-blocking `millis()` state machines. |
| Watchdog Issues | PASS | `delay(10)` exists in loop to yield to FreeRTOS watchdog. Non-blocking state machines prevent watchdog starvation. |
| Incorrect GPIO Usage | PASS | GPIO 8, 9, 10 are valid for ESP32-C3. |
| Missing Includes | PASS | All dependencies are included in headers and `.cpp` files. |
| Race Conditions | PASS | Callbacks run in sequence. Global states safely mutated. |
| Debounce Correctness | PASS | Debounce logic correctly uses a 50ms window before state updates. |
| Long Press Correctness | PASS | The `_pressStartTime` is updated properly and triggered when delay threshold is met. |
| Callback Safety | PASS | Null checks on callbacks are present. |
| BLE Reconnect Logic | PASS | Automatic re-advertising implemented on disconnect. |
| Notify/Write Correctness | PASS | Standard string payloads used safely. |
| UUID Consistency | PASS | UUIDs match between firmware and React Native app. |
| Battery Optimization | WARNING | Basic yielding implemented (`delay(10)`). A true `Light Sleep` mode or extending BLE advertising interval could further improve battery life. |
| Power Saving Opps | WARNING | The ESP32-C3 can reduce CPU frequency to 80MHz and enter light sleep, which isn't currently configured. |

## Actions Taken
- Rewrote `led_manager` and `vibration_manager` to eliminate blocking delays.
- Removed dynamic heap allocation `new` during button press callback to fix memory leaks.
