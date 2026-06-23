# SafeHer Phase 8 — APK Build Guide

## Prerequisites Checklist
- [ ] Verify app runs in Expo Go without crashes
- [ ] Verify Manual SOS, Silent SOS, Duress PIN, Real PIN all work
- [ ] Verify Safe Window and Dead Man Check-in work
- [ ] Verify Alert History shows all alert types
- [ ] Verify location permission request and graceful denial handling

## Backend URL Configuration
- For Expo Go on physical device: update `.env` `EXPO_PUBLIC_API_BASE_URL` to your laptop's local IP (e.g. `http://192.168.1.45:8000`)
- For emulator: use `http://10.0.2.2:8000`
- For production: update to deployed backend URL
- **NEVER** place SUPABASE_SERVICE_ROLE_KEY in mobile code

## Dashboard URL
- Local development: `http://localhost:5173`
- Dashboard reads from backend at `VITE_API_BASE_URL` in dashboard/.env

## EAS Build Commands
```bash
# Login to Expo
npx eas-cli@latest login

# Configure project (first time only)
npx eas-cli@latest build:configure

# Build preview APK
npx eas-cli@latest build -p android --profile preview

# Build production AAB
npx eas-cli@latest build -p android --profile production
```

## Known Limitations (V1)
- Backend sync is offline-first (fire-and-forget)
- SMS/Voice triggers are not implemented
- Background location tracking is not implemented
- No push notifications yet

## Security Reminders
- SUPABASE_SERVICE_ROLE_KEY must ONLY exist in backend/.env
- Do NOT commit .env files
- Update EXPO_PUBLIC_API_BASE_URL before building APK for physical device testing
