-- 17_guardian_command_center_stability_fix.sql

-- ============================================================================
-- 1.1 guardian_alert_actions
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.guardian_alert_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_id UUID NOT NULL,
    guardian_user_id UUID NOT NULL,
    protected_user_id UUID,
    journey_id UUID,
    action_type TEXT NOT NULL,
    message TEXT,
    status TEXT DEFAULT 'success',
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure Foreign Keys (using DO block to be idempotent)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'guardian_alert_actions_alert_id_fkey') THEN
        ALTER TABLE public.guardian_alert_actions
            ADD CONSTRAINT guardian_alert_actions_alert_id_fkey FOREIGN KEY (alert_id) REFERENCES public.sos_alerts(id) ON DELETE CASCADE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'guardian_alert_actions_guardian_user_id_fkey') THEN
        ALTER TABLE public.guardian_alert_actions
            ADD CONSTRAINT guardian_alert_actions_guardian_user_id_fkey FOREIGN KEY (guardian_user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS guardian_alert_actions_alert_id_idx ON public.guardian_alert_actions(alert_id);
CREATE INDEX IF NOT EXISTS guardian_alert_actions_guardian_user_id_idx ON public.guardian_alert_actions(guardian_user_id);
CREATE INDEX IF NOT EXISTS guardian_alert_actions_created_at_idx ON public.guardian_alert_actions(created_at);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.guardian_alert_actions TO service_role;
GRANT SELECT, INSERT ON public.guardian_alert_actions TO authenticated;


-- ============================================================================
-- 1.2 notification_events
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.notification_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid()
);

ALTER TABLE public.notification_events
    ADD COLUMN IF NOT EXISTS alert_id UUID,
    ADD COLUMN IF NOT EXISTS user_id UUID,
    ADD COLUMN IF NOT EXISTS guardian_user_id UUID,
    ADD COLUMN IF NOT EXISTS event_type TEXT DEFAULT 'UNKNOWN',
    ADD COLUMN IF NOT EXISTS status TEXT,
    ADD COLUMN IF NOT EXISTS channel TEXT,
    ADD COLUMN IF NOT EXISTS destination TEXT,
    ADD COLUMN IF NOT EXISTS provider TEXT,
    ADD COLUMN IF NOT EXISTS provider_message_id TEXT,
    ADD COLUMN IF NOT EXISTS error_message TEXT,
    ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Indexes
CREATE INDEX IF NOT EXISTS notification_events_alert_id_idx ON public.notification_events(alert_id);
CREATE INDEX IF NOT EXISTS notification_events_user_id_idx ON public.notification_events(user_id);
CREATE INDEX IF NOT EXISTS notification_events_created_at_idx ON public.notification_events(created_at);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_events TO service_role;
GRANT SELECT ON public.notification_events TO authenticated;


-- ============================================================================
-- 1.3 safe_windows
-- ============================================================================

ALTER TABLE public.safe_windows
    ADD COLUMN IF NOT EXISTS current_latitude DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS current_longitude DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS current_address TEXT,
    ADD COLUMN IF NOT EXISTS last_location_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS location_provider TEXT,
    ADD COLUMN IF NOT EXISTS location_accuracy DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS start_latitude DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS start_longitude DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS start_address TEXT,
    ADD COLUMN IF NOT EXISTS destination_latitude DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS destination_longitude DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS destination_address TEXT,
    ADD COLUMN IF NOT EXISTS distance_km DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS estimated_duration_minutes INTEGER,
    ADD COLUMN IF NOT EXISTS estimated_arrival_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS route_polyline TEXT,
    ADD COLUMN IF NOT EXISTS route_provider TEXT,
    ADD COLUMN IF NOT EXISTS route_status TEXT;


-- ============================================================================
-- 1.4 sos_alerts
-- ============================================================================

ALTER TABLE public.sos_alerts
    ADD COLUMN IF NOT EXISTS location_lat DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS location_long DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS location_accuracy DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS location_captured_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS location_map_link TEXT,
    ADD COLUMN IF NOT EXISTS location_permission_denied BOOLEAN DEFAULT false;


-- ============================================================================
-- 1.5 End of migration
-- ============================================================================

NOTIFY pgrst, 'reload schema';
