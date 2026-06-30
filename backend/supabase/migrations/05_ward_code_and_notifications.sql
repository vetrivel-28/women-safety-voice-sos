-- Phase 1: Ward Code Migration
ALTER TABLE public.profiles RENAME COLUMN guardian_code TO ward_code;

-- Fill in any null or non-6-digit codes with a 6-digit random code string
UPDATE public.profiles
SET ward_code = lpad(floor(random() * 1000000)::text, 6, '0')
WHERE ward_code IS NULL OR ward_code !~ '^[0-9]{6}$';

-- Add constraints
ALTER TABLE public.profiles
ADD CONSTRAINT profiles_ward_code_format_chk CHECK (ward_code ~ '^[0-9]{6}$');

-- Phase 2: Reset Guardian Links (For Dev/Demo testing)
DELETE FROM public.guardian_links;

-- Phase 6: In-App Notifications Schema
CREATE TABLE IF NOT EXISTS public.in_app_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  alert_id uuid REFERENCES public.sos_alerts(id) ON DELETE CASCADE,
  journey_id uuid REFERENCES public.safe_windows(id) ON DELETE SET NULL,
  type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_in_app_notifications_user_created
ON public.in_app_notifications(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_in_app_notifications_user_unread
ON public.in_app_notifications(user_id)
WHERE read_at IS NULL;

-- Enable RLS and setup policies
ALTER TABLE public.in_app_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notifications"
ON public.in_app_notifications FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own notifications"
ON public.in_app_notifications FOR UPDATE
USING (auth.uid() = user_id);

-- PostgREST notify
NOTIFY pgrst, 'reload schema';
