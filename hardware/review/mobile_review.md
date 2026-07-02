# React Native Review

## Summary
The mobile integration was reviewed for memory leaks, subscription cleanup, and background compatibility.

## Review Items

| Item | Status | Notes |
| :--- | :--- | :--- |
| BLE Scanning | PASS | Correctly searches for the specific Ring Service UUID. |
| Permissions | PASS | Android API 31+ permissions correctly requested. iOS handled via `app.json` config plugin. |
| Reconnect Logic | PASS | Triggers `setTimeout` to restart scanning upon disconnect. |
| Cleanup / Memory Leaks | PASS | Fixed a missing subscription removal for `monitorCharacteristicForService` inside `BLEManager.ts`. |
| Subscription Removal | PASS | Both Context and BLEManager cleanly unsubscribe. |
| Background Handling | WARNING | Expo's `react-native-ble-plx` background mode is enabled in iOS via `app.json`, but Android and modern iOS versions aggressively kill background tasks. Without a Foreground Service (Android) or aggressive background location polling, background SOS triggering is not guaranteed if the app is swiped away. |

## Actions Taken
- Patched `BLEManager.ts` to capture the monitor subscription object and invoke `.remove()` on disconnect to prevent memory leaks and zombie listeners.
