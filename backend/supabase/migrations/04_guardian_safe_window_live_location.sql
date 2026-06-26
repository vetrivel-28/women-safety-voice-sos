-- Guardian links adjustments
ALTER TABLE public.guardian_links
DROP CONSTRAINT IF EXISTS guardian_links_user_id_guardian_user_id_key;

ALTER TABLE public.guardian_links
ADD CONSTRAINT guardian_links_user_id_guardian_user_id_key UNIQUE (user_id, guardian_user_id);

-- Profiles guardian_code
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS guardian_code TEXT UNIQUE;

-- Backfill guardian codes (random generation for existing profiles that lack one)
UPDATE public.profiles
SET guardian_code = 'SH-' || upper(substr(md5(random()::text), 1, 6))
WHERE guardian_code IS NULL;

-- Safe Windows missing columns
ALTER TABLE public.safe_windows
ADD COLUMN IF NOT EXISTS destination_latitude DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS destination_longitude DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS current_latitude DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS current_longitude DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS current_address TEXT,
ADD COLUMN IF NOT EXISTS last_location_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS duration_seconds INT;

-- Trigger type
ALTER TYPE public.trigger_type ADD VALUE IF NOT EXISTS 'DEAD_MAN_MISSED';

-- Notification Events (if needed)
CREATE TABLE IF NOT EXISTS public.notification_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_id UUID REFERENCES public.sos_alerts(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES public.emergency_contacts(id) ON DELETE SET NULL,
    channel TEXT,
    recipient TEXT,
    status TEXT,
    message TEXT,
    provider_response TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_events TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.guardian_links TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.safe_windows TO authenticated, service_role;

-- RLS for safe_windows: users can manage their own
ALTER TABLE public.safe_windows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own safe windows" ON public.safe_windows;
CREATE POLICY "Users can manage own safe windows" ON public.safe_windows 
FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- RLS for guardian_links: protected user manages their own, guardian can read links to themselves
ALTER TABLE public.guardian_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage their own guardian links" ON public.guardian_links;
CREATE POLICY "Users manage their own guardian links" ON public.guardian_links 
FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Guardians can view incoming links" ON public.guardian_links;
CREATE POLICY "Guardians can view incoming links" ON public.guardian_links 
FOR SELECT TO authenticated USING (auth.uid() = guardian_user_id);
