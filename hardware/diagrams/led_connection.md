# LED Connection

```mermaid
graph LR
    ESP[ESP32 GPIO 8] --> Res[220 Ohm Resistor]
    Res --> LED_Anode[LED Anode (+)]
    LED_Cathode[LED Cathode (-)] --> GND[Common GND]
```

*Note: The internal LED on GPIO 8 can be used without external components on most ESP32-C3 Super Mini boards.*
