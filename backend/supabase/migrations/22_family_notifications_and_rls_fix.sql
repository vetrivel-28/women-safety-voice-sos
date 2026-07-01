-- 22_family_notifications_and_rls_fix.sql
-- Idempotent migration that:
-- 1. Ensures in_app_notifications permissions and RLS are correct (supplements migration 20)
-- 2. Ensures family_join_requests RLS allows the host to read pending requests
-- 3. Ensures family tables have correct service_role grants
--
-- Run in Supabase SQL Editor. Safe to re-run.

-- ============================================================
-- A. in_app_notifications — permissions & RLS
-- ============================================================

-- Ensure table exists
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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_in_app_notifs_user_created
  ON public.in_app_notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_in_app_notifs_user_unread
  ON public.in_app_notifications(user_id)
  WHERE read_at IS NULL;

-- Enable RLS
ALTER TABLE public.in_app_notifications ENABLE ROW LEVEL SECURITY;

-- Drop & recreate policies to be idempotent
DROP POLICY IF EXISTS "Users can view their own notifications"   ON public.in_app_notifications;
DROP POLICY IF EXISTS "Users can update their own notifications" ON public.in_app_notifications;

CREATE POLICY "Users can view their own notifications"
  ON public.in_app_notifications FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own notifications"
  ON public.in_app_notifications FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Grants: service_role full, authenticated read+update
GRANT SELECT, INSERT, UPDATE, DELETE ON public.in_app_notifications TO service_role;
GRANT SELECT, UPDATE ON public.in_app_notifications TO authenticated;


-- ============================================================
-- B. family_join_requests — ensure host can see requests
-- ============================================================

ALTER TABLE public.family_join_requests ENABLE ROW LEVEL SECURITY;

-- Drop and recreate all policies cleanly
DROP POLICY IF EXISTS "Requester can view own requests"    ON public.family_join_requests;
DROP POLICY IF EXISTS "Requester can insert own requests"  ON public.family_join_requests;
DROP POLICY IF EXISTS "Host can view family requests"      ON public.family_join_requests;
DROP POLICY IF EXISTS "Host can update family requests"    ON public.family_join_requests;

-- Requester can see and create their own requests
CREATE POLICY "Requester can view own requests"
  ON public.family_join_requests FOR SELECT TO authenticated
  USING (requester_user_id = auth.uid());

CREATE POLICY "Requester can insert own requests"
  ON public.family_join_requests FOR INSERT TO authenticated
  WITH CHECK (requester_user_id = auth.uid());

-- Family host can see and respond to requests for their family
CREATE POLICY "Host can view family requests"
  ON public.family_join_requests FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.families
      WHERE id = family_join_requests.family_id
        AND host_user_id = auth.uid()
    )
  );

CREATE POLICY "Host can update family requests"
  ON public.family_join_requests FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.families
      WHERE id = family_join_requests.family_id
        AND host_user_id = auth.uid()
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.family_join_requests TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.family_join_requests TO authenticated;


-- ============================================================
-- C. family_members — service_role grants
-- ============================================================

ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Active members can view family members" ON public.family_members;
DROP POLICY IF EXISTS "Host or self can update family members" ON public.family_members;
DROP POLICY IF EXISTS "Host or self can delete family members" ON public.family_members;

CREATE POLICY "Active members can view family members"
  ON public.family_members FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.family_members AS self
      WHERE self.family_id = family_members.family_id
        AND self.user_id = auth.uid()
        AND self.status = 'active'
    )
  );

CREATE POLICY "Host or self can update family members"
  ON public.family_members FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.families
      WHERE id = family_members.family_id AND host_user_id = auth.uid()
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.family_members TO service_role;
GRANT SELECT, UPDATE ON public.family_members TO authenticated;


-- ============================================================
-- D. families — service_role grants
-- ============================================================

ALTER TABLE public.families ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Active members can view family" ON public.families;
DROP POLICY IF EXISTS "Any user can create family"     ON public.families;
DROP POLICY IF EXISTS "Host can update family"         ON public.families;
DROP POLICY IF EXISTS "Host can delete family"         ON public.families;

CREATE POLICY "Active members can view family"
  ON public.families FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.family_members
      WHERE family_members.family_id = id
        AND family_members.user_id = auth.uid()
        AND family_members.status = 'active'
    )
  );

CREATE POLICY "Any user can create family"
  ON public.families FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = host_user_id);

CREATE POLICY "Host can update family"
  ON public.families FOR UPDATE TO authenticated
  USING (auth.uid() = host_user_id)
  WITH CHECK (auth.uid() = host_user_id);

CREATE POLICY "Host can delete family"
  ON public.families FOR DELETE TO authenticated
  USING (auth.uid() = host_user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.families TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.families TO authenticated;


-- ============================================================
-- E. guardian_links — grants
-- ============================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.guardian_links TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.guardian_links TO authenticated;


-- ============================================================
-- F. Reload PostgREST schema cache
-- ============================================================

NOTIFY pgrst, 'reload schema';
