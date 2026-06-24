# SafeHer APK Build Instructions & Notes

## Expo Go Testing
To test this app on a physical device using Expo Go:
1. Ensure your phone and development laptop are on the **same Wi-Fi network**.
2. Run `npx expo start -c` from the `mobile` directory.
3. If connecting to a local backend, your `EXPO_PUBLIC_API_BASE_URL` should point to your laptop's local IP address (e.g. `http://192.168.1.5:8000`), NOT `http://localhost:8000` or `127.0.0.1`, because the phone's localhost is the phone itself.
4. Scan the QR code using the Expo Go app.

## Backend Dependencies
- Ensure the backend is running (`uvicorn app.main:app --reload --host 0.0.0.0 --port 8000`).
- **Important:** The service-role key (`SUPABASE_SERVICE_ROLE_KEY`) must **only** be stored in the `backend/.env` file. Do not include it in the mobile app or dashboard for security reasons.
- **Notifications:** Automatic SMS/Email generation relies on the backend provider configuration (`NOTIFICATION_PROVIDER`). If it's not set up, it will gracefully fallback and not crash.

## APK Readiness (For Later Deployment)
Do not generate the APK now. When you are ready to build the standalone APK:
```bash
npx eas-cli build -p android --profile preview
```

**Known Limitations in V1/V2:**
- The shake-to-trigger SOS and Voice Guard features are placeholders for future sensor integrations.
- Background location and background timer tracking limitations may apply on some Android/iOS versions when using purely Expo Go without native background plugins configured aggressively.

## Environment Variables
Never track `.env` files in git. All secrets should be excluded in `.gitignore`.
