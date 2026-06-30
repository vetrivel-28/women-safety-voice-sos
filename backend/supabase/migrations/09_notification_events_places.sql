-- 09_notification_events_places.sql
-- Add missing columns to public.notification_events

ALTER TABLE public.notification_events 
ADD COLUMN IF NOT EXISTS journey_id UUID REFERENCES public.safe_windows(id) ON DELETE CASCADE;

ALTER TABLE public.notification_events 
ADD COLUMN IF NOT EXISTS event_type TEXT;

ALTER TABLE public.notification_events 
ADD COLUMN IF NOT EXISTS recipient_type TEXT;

ALTER TABLE public.notification_events 
ADD COLUMN IF NOT EXISTS recipient_id UUID;

ALTER TABLE public.notification_events 
ADD COLUMN IF NOT EXISTS recipient_phone TEXT;

ALTER TABLE public.notification_events 
ADD COLUMN IF NOT EXISTS metadata JSONB;
