# SafeHer Hardware Module

This directory contains the firmware and documentation for the SafeHer Smart Ring, an ESP32-C3 based wearable device that integrates with the SafeHer mobile application.

## Directory Structure

*   `firmware/`: The C++ source code for the ESP32-C3 microcontroller.
*   `docs/`: Detailed documentation on hardware setup, pin mapping, and testing.
*   `diagrams/`: Markdown-based wiring descriptions for the various components.

## Features

*   **BLE Connectivity**: Connects to the React Native app.
*   **SOS Trigger**: Physical button to instantly trigger an SOS alert on the user's phone.
*   **Vibration Feedback**: Acknowledges successful SOS dispatch with a tactile vibration pattern.
*   **LED Feedback**: Visual indicator for connectivity and actions.

## Getting Started

1.  Read `docs/hardware_setup.md` to understand the required components.
2.  Follow the wiring in `docs/pin_mapping.md` and `diagrams/final_ring_connection.md`.
3.  Flash the code in `firmware/` using the Arduino IDE or PlatformIO.
4.  Pair with the SafeHer mobile app.
