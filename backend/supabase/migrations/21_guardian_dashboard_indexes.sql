-- 21_guardian_dashboard_indexes.sql
-- Idempotent performance indexes for guardian dashboard queries.
-- Reduces 503/Supabase timeout errors on /api/guardians/dashboard,
-- /api/guardians/alerts, /api/guardians/safe-windows.

-- sos_alerts: filter by user_id + status (most common guardian query)
CREATE INDEX IF NOT EXISTS idx_sos_alerts_user_status
  ON public.sos_alerts(user_id, status);

CREATE INDEX IF NOT EXISTS idx_sos_alerts_user_created
  ON public.sos_alerts(user_id, created_at DESC);

-- sos_alerts: query by status alone for active-only filters
CREATE INDEX IF NOT EXISTS idx_sos_alerts_status
  ON public.sos_alerts(status)
  WHERE status IN ('ACTIVE', 'SILENT_DURESS_ACTIVE');

-- safe_windows (journeys): filter by user_id + status
CREATE INDEX IF NOT EXISTS idx_safe_windows_user_status
  ON public.safe_windows(user_id, status);

CREATE INDEX IF NOT EXISTS idx_safe_windows_user_started
  ON public.safe_windows(user_id, started_at DESC);

-- guardian_links: the two FK directions queried in every guardian endpoint
CREATE INDEX IF NOT EXISTS idx_guardian_links_guardian_user_id
  ON public.guardian_links(guardian_user_id);

CREATE INDEX IF NOT EXISTS idx_guardian_links_user_id
  ON public.guardian_links(user_id);

CREATE INDEX IF NOT EXISTS idx_guardian_links_guardian_status
  ON public.guardian_links(guardian_user_id, status);

-- in_app_notifications: already indexed in migration 20, adding redundancy guard
CREATE INDEX IF NOT EXISTS idx_in_app_notifications_user_created
  ON public.in_app_notifications(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_in_app_notifications_user_unread
  ON public.in_app_notifications(user_id)
  WHERE read_at IS NULL;

-- guardian_alert_actions: filter by alert_id (frequently joined)
CREATE INDEX IF NOT EXISTS idx_guardian_alert_actions_alert_id
  ON public.guardian_alert_actions(alert_id);

CREATE INDEX IF NOT EXISTS idx_guardian_alert_actions_guardian
  ON public.guardian_alert_actions(guardian_user_id);

-- family_members: membership lookup
CREATE INDEX IF NOT EXISTS idx_family_members_user_status
  ON public.family_members(user_id, status);

NOTIFY pgrst, 'reload schema';
