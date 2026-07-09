# BLE Protocol

The SafeHer Ring uses a standard GATT architecture.

## Device Identification
*   **Device Name:** `SafeHer Ring`
*   **Service UUID:** `19b10000-e8f2-537e-4f6c-d104768a1214`

## Characteristics

### TX Characteristic (ESP32 -> Phone)
*   **UUID:** `19b10001-e8f2-537e-4f6c-d104768a1214`
*   **Properties:** `Notify`
*   **Payloads:**
    *   `"SOS"`: Sent when the button is pressed (single or long press).

### RX Characteristic (Phone -> ESP32)
*   **UUID:** `19b10002-e8f2-537e-4f6c-d104768a1214`
*   **Properties:** `Write`
*   **Payloads:**
    *   `"ACK"`: Sent by the phone when the SOS is successfully dispatched. Triggers a double-vibration on the ring.
