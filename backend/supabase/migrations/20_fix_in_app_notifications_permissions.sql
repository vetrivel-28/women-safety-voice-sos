-- 20_fix_in_app_notifications_permissions.sql
-- Idempotent fix for in_app_notifications table permissions and RLS policies.
-- Run this in your Supabase project SQL editor (or dashboard > SQL editor).

-- 1. Ensure the table exists (safe no-op if already created by migration 05/06)
CREATE TABLE IF NOT EXISTS public.in_app_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  alert_id UUID REFERENCES public.sos_alerts(id) ON DELETE CASCADE,
  journey_id UUID REFERENCES public.safe_windows(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_in_app_notifications_user_created
  ON public.in_app_notifications(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_in_app_notifications_user_unread
  ON public.in_app_notifications(user_id)
  WHERE read_at IS NULL;

-- 3. Enable RLS (idempotent)
ALTER TABLE public.in_app_notifications ENABLE ROW LEVEL SECURITY;

-- 4. Drop and recreate RLS policies cleanly
DROP POLICY IF EXISTS "Users can view their own notifications"   ON public.in_app_notifications;
DROP POLICY IF EXISTS "Users can update their own notifications" ON public.in_app_notifications;
DROP POLICY IF EXISTS "Service role can insert notifications"    ON public.in_app_notifications;

-- Authenticated users can SELECT their own rows
CREATE POLICY "Users can view their own notifications"
  ON public.in_app_notifications
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Authenticated users can UPDATE (mark read) their own rows
CREATE POLICY "Users can update their own notifications"
  ON public.in_app_notifications
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 5. Grant explicit table-level permissions to the roles used by the Supabase clients
--    service_role: full access (bypasses RLS already, but explicit grant avoids edge cases)
--    authenticated: SELECT + UPDATE (INSERT/DELETE handled by service_role on behalf of app)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.in_app_notifications TO service_role;
GRANT SELECT, UPDATE ON public.in_app_notifications TO authenticated;

-- 6. Also grant sequence usage so inserts with gen_random_uuid() don't fail
--    (gen_random_uuid() uses pg_catalog, not a sequence — but granting just in case)
-- No sequence grant needed for UUID DEFAULT gen_random_uuid()

-- 7. Grant guardian alert actions and notification_events while we're here
GRANT SELECT, INSERT, UPDATE, DELETE ON public.guardian_alert_actions TO service_role, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_events        TO service_role, authenticated;

-- 8. Ensure profile table grants are correct (service_role needs full access for upserts)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO service_role;
GRANT SELECT, UPDATE ON public.profiles TO authenticated;

-- 9. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
