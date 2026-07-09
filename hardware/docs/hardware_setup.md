# Hardware Setup

## Components Required
*   1x ESP32-C3 Super Mini
*   1x Push Button (Tactile switch)
*   1x Coin Vibration Motor (3V)
*   1x 2N2222A NPN Transistor (or equivalent logic-level MOSFET)
*   1x 1N4148 Diode (Flyback diode for the motor)
*   1x 1kΩ Resistor (For the transistor base)
*   1x LED (Optional, if not using the internal one)
*   1x 220Ω Resistor (If using an external LED)
*   Wires, breadboard, or custom PCB
*   Small LiPo Battery (e.g., 3.7V 100mAh)

## Assembly Guidelines
1.  **Compactness:** Since this is designed to be a wearable (ring/pendant format), you will eventually need to solder these components tightly. For prototyping, use a standard breadboard.
2.  **Power:** The ESP32-C3 Super Mini can run off a 3.7V LiPo battery. Connect the positive terminal to the 5V/VBUS pin (which usually has an LDO dropping it to 3.3V) or the 3.3V pin if you have an external regulator. *Check your specific board's schematic before connecting directly to 3.3V*.
3.  **Vibration Motor:** Do **not** connect the motor directly to a GPIO pin. GPIO pins cannot supply the current required for a motor (often > 50mA). Always use a transistor.

See the `diagrams/` folder for specific wiring instructions.
