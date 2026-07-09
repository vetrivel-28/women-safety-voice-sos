# Pin Mapping

The SafeHer Ring uses the ESP32-C3 Super Mini. Below is the pin mapping used in the firmware (`config.h`).

| Component | ESP32-C3 Pin | Notes |
| :--- | :--- | :--- |
| **LED** | GPIO 8 | Can be the internal blue LED, or an external LED with a resistor (e.g., 220Ω) to GND. |
| **Push Button** | GPIO 9 | Connect one side to GPIO 9 and the other side to GND. The firmware uses `INPUT_PULLUP`. |
| **Vibration Motor** | GPIO 10 | Connect to the base of a 2N2222A transistor via a 1kΩ resistor. |

> **Note:** The ESP32-C3 Super Mini has limited GPIOs exposed. Make sure not to use the strapping pins (GPIO 2, 8, 9) in a way that prevents booting, though 8 and 9 are generally safe to use after boot if configured correctly. Since we use `INPUT_PULLUP` on 9, it will be pulled HIGH during boot, which is the required state.
