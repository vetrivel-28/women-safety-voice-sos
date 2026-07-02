# Testing Guide

## 1. Unit Testing Firmware Modules
Without physical hardware, you can verify compilation using the Arduino CLI or IDE. 
Select `ESP32C3 Dev Module` as the target board.

## 2. Hardware Breadboard Test
1.  Flash `main.ino` to the ESP32-C3 Super Mini.
2.  Open the Serial Monitor at 115200 baud.
3.  Press the physical button. You should see `Button Pressed. Type: 1` (or 3) in the serial monitor. The LED should blink.
4.  Use a BLE scanning app (like nRF Connect on iOS/Android).
5.  Search for "SafeHer Ring".
6.  Connect to the device.
7.  Subscribe to notifications on `19b10001-e8f2-537e-4f6c-d104768a1214`.
8.  Press the physical button. You should see "SOS" arrive as a notification on your phone.
9.  Write the string "ACK" to the RX characteristic `19b10002-e8f2-537e-4f6c-d104768a1214`.
10. The motor should vibrate twice, and the LED should flash twice.

## 3. Full System Test
1.  Ensure the React Native app is running and the hardware module is powered on.
2.  The app should automatically scan and connect to the ring.
3.  Press the ring's button.
4.  Verify that the SOS alert is triggered in the SafeHer app.
5.  Verify that the ring vibrates to confirm the SOS was dispatched.
