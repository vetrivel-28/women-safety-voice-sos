-- 11_notification_events_timeline.sql
-- Ensure all columns required for the Notification Events Timeline are present
-- and properly typed on public.notification_events

ALTER TABLE public.notification_events 
ADD COLUMN IF NOT EXISTS journey_id UUID REFERENCES public.safe_windows(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS event_type TEXT,
ADD COLUMN IF NOT EXISTS recipient_type TEXT,
ADD COLUMN IF NOT EXISTS recipient_id UUID,
ADD COLUMN IF NOT EXISTS recipient_phone TEXT,
ADD COLUMN IF NOT EXISTS metadata JSONB,
ADD COLUMN IF NOT EXISTS channel TEXT,
ADD COLUMN IF NOT EXISTS status TEXT,
ADD COLUMN IF NOT EXISTS message TEXT,
ADD COLUMN IF NOT EXISTS provider_response TEXT;
