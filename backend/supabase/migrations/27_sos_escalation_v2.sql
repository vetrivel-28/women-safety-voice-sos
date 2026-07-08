-- Add updated_at to existing sos_alerts
ALTER TABLE public.sos_alerts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Create ENUM for SOS Escalation Contact Type
DO  BEGIN
    CREATE TYPE escalation_contact_type AS ENUM ('guardian_app_user', 'sms_contact');
EXCEPTION
    WHEN duplicate_object THEN null;
END ;

-- Create SOS Escalation Targets table
CREATE TABLE IF NOT EXISTS public.sos_escalation_targets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sos_alert_id UUID REFERENCES public.sos_alerts(id) ON DELETE CASCADE NOT NULL,
    contact_type escalation_contact_type NOT NULL,
    target_ref TEXT NOT NULL,
    priority_order INT NOT NULL,
    notified_at TIMESTAMPTZ,
    acknowledged_at TIMESTAMPTZ,
    UNIQUE(sos_alert_id, target_ref)
);

-- RLS for escalation targets
ALTER TABLE public.sos_escalation_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view targets for their alerts" ON public.sos_escalation_targets
    FOR SELECT USING (
        EXISTS (
            SELECT 1
            FROM public.sos_alerts a
            WHERE a.id = sos_alert_id AND a.user_id = auth.uid()
        )
    );
