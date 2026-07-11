# SafeHer Backend — Developer Setup

## ⚠️ Important: Use the Correct Virtual Environment

**Always activate the project's own venv before running the backend.**
If you run with the wrong venv (e.g., `forecasting_agent/venv`), you may get import errors or wrong package versions.

```powershell
# From the backend directory
cd C:\Users\annie\women_safety\backend

# Create venv (first time only)
python -m venv venv

# Activate on Windows (PowerShell)
.\venv\Scripts\Activate.ps1

# Or on Windows CMD
.\venv\Scripts\activate.bat

# Install dependencies
pip install -r requirements.txt

# Run the backend
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

## Database Migrations

Migrations are in `supabase/migrations/`. They are numbered and idempotent.
Run them **in order** in the Supabase SQL editor:

| Migration | Purpose |
|-----------|---------|
| `19_fix_ward_codes_and_family_recipients.sql` | Ensure all guardian_code values are valid 6-digit codes |
| `20_fix_in_app_notifications_permissions.sql` | **Required**: Fixes permission denied errors on in_app_notifications |
| `21_guardian_dashboard_indexes.sql` | Performance indexes to reduce 503 timeouts |
| `26_fix_signup_guardian_code.sql` | **Critical**: Sets DEFAULT for guardian_code to fix signup failures |
| `27_fix_handle_new_user_guardian_code.sql` | **CONDITIONAL**: Only apply if trigger explicitly inserts NULL for guardian_code (see SIGNUP_FIX_ANALYSIS.md) |

> Run these manually in Supabase dashboard > SQL Editor if the backend startup doesn't apply them automatically.

### Before Applying Migration 27

**IMPORTANT**: Migration 27 should only be applied if the auth.users trigger explicitly includes `guardian_code` in its INSERT statement. To check:

1. Run `find_trigger_function.sql` in Supabase SQL Editor
2. Check if the INSERT statement includes `guardian_code`
3. If YES → Apply migration 27
4. If NO → Migration 26 alone is sufficient

See `SIGNUP_FIX_ANALYSIS.md` for detailed analysis.

## Push Notifications (Expo SDK 53+)

- **Remote push notifications require a development build** — they do NOT work in Expo Go with SDK 53+.
- **In-app notifications (via backend polling) still work in Expo Go.**
- To test full push notifications, run:
  ```bash
  npx expo run:android   # or
  npx expo run:ios
  ```
