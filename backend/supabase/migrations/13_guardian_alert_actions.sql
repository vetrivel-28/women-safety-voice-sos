-- 13_guardian_alert_actions.sql
-- Create guardian_alert_actions table

CREATE TABLE IF NOT EXISTS public.guardian_alert_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id UUID NOT NULL REFERENCES public.sos_alerts(id) ON DELETE CASCADE,
  guardian_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  protected_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  journey_id UUID REFERENCES public.safe_windows(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  message TEXT,
  status TEXT DEFAULT 'success',
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.guardian_alert_actions TO authenticated, service_role;

-- RLS
ALTER TABLE public.guardian_alert_actions ENABLE ROW LEVEL SECURITY;

-- Allow user to read actions for their own alerts
CREATE POLICY "Users can read actions for their own alerts"
  ON public.guardian_alert_actions FOR SELECT
  TO authenticated
  USING (auth.uid() = protected_user_id);

-- Allow guardians to read actions for users they guard
CREATE POLICY "Guardians can read actions for users they guard"
  ON public.guardian_alert_actions FOR SELECT
  TO authenticated
  USING (auth.uid() IN (
      SELECT guardian_user_id 
      FROM public.guardian_links 
      WHERE guardian_links.user_id = guardian_alert_actions.protected_user_id 
      AND guardian_links.status = 'ACTIVE'
  ));
  
-- Allow guardians to insert actions for users they guard
CREATE POLICY "Guardians can insert actions for users they guard"
  ON public.guardian_alert_actions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IN (
      SELECT guardian_user_id 
      FROM public.guardian_links 
      WHERE guardian_links.user_id = guardian_alert_actions.protected_user_id 
      AND guardian_links.status = 'ACTIVE'
  ));
