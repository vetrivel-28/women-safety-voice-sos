-- 14_notification_events_columns.sql
-- Ensure all required columns exist

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notification_events' AND column_name = 'id') THEN
        ALTER TABLE public.notification_events ADD COLUMN id UUID PRIMARY KEY DEFAULT gen_random_uuid();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notification_events' AND column_name = 'user_id') THEN
        ALTER TABLE public.notification_events ADD COLUMN user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notification_events' AND column_name = 'alert_id') THEN
        ALTER TABLE public.notification_events ADD COLUMN alert_id UUID REFERENCES public.sos_alerts(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notification_events' AND column_name = 'created_at') THEN
        ALTER TABLE public.notification_events ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notification_events' AND column_name = 'event_type') THEN
        ALTER TABLE public.notification_events ADD COLUMN event_type TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notification_events' AND column_name = 'status') THEN
        ALTER TABLE public.notification_events ADD COLUMN status TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notification_events' AND column_name = 'message') THEN
        ALTER TABLE public.notification_events ADD COLUMN message TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notification_events' AND column_name = 'metadata') THEN
        ALTER TABLE public.notification_events ADD COLUMN metadata JSONB;
    END IF;
END $$;
