-- Create Notification Events table for deduplication
CREATE TABLE IF NOT EXISTS public.notification_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL,
    entity_id UUID NOT NULL,
    recipient_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(event_type, entity_id, recipient_id)
);

-- Create Notification Deliveries table
CREATE TABLE IF NOT EXISTS public.notification_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_event_id UUID REFERENCES public.notification_events(id) ON DELETE CASCADE NOT NULL,
    delivered_at TIMESTAMPTZ,
    seen_at TIMESTAMPTZ,
    acted_at TIMESTAMPTZ,
    dismissed_at TIMESTAMPTZ,
    UNIQUE(notification_event_id)
);

-- RLS for notifications
ALTER TABLE public.notification_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notification events" ON public.notification_events
    FOR SELECT USING (auth.uid() = recipient_id);

CREATE POLICY "Users can view their own deliveries" ON public.notification_deliveries
    FOR SELECT USING (
        EXISTS (
            SELECT 1
            FROM public.notification_events e
            WHERE e.id = notification_event_id AND e.recipient_id = auth.uid()
        )
    );

CREATE POLICY "Users can update their own deliveries" ON public.notification_deliveries
    FOR UPDATE USING (
        EXISTS (
            SELECT 1
            FROM public.notification_events e
            WHERE e.id = notification_event_id AND e.recipient_id = auth.uid()
        )
    );
