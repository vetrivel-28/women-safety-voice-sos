-- Phase 2 & 3: Schema Alignment and RLS Migration

-- 1. emergency_contacts
CREATE TABLE IF NOT EXISTS public.emergency_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    relationship TEXT,
    priority INT DEFAULT 1,
    is_primary BOOLEAN DEFAULT false,
    notification_preference TEXT DEFAULT 'sms',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- Explicitly ensure web role access is restored if it was revoked
GRANT SELECT, INSERT, UPDATE, DELETE ON public.emergency_contacts TO authenticated, service_role;

-- 2. guardian_links
CREATE TABLE IF NOT EXISTS public.guardian_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    guardian_user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    guardian_email TEXT,
    guardian_phone TEXT,
    relationship TEXT,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, guardian_user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.guardian_links TO authenticated, service_role;

-- 3. journey_sessions
CREATE TABLE IF NOT EXISTS public.journey_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    journey_name TEXT,
    start_label TEXT,
    start_latitude DOUBLE PRECISION,
    start_longitude DOUBLE PRECISION,
    destination_label TEXT,
    destination_latitude DOUBLE PRECISION,
    destination_longitude DOUBLE PRECISION,
    status TEXT DEFAULT 'ACTIVE',
    route_status TEXT DEFAULT 'NORMAL',
    risk_level TEXT DEFAULT 'LOW',
    check_in_interval_minutes INT DEFAULT 5,
    expected_duration_minutes INT DEFAULT 30,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    ends_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.journey_sessions TO authenticated, service_role;

-- 4. notification_events
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
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_events TO authenticated, service_role;

-- RLS POLICIES --

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergency_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guardian_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journey_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_events ENABLE ROW LEVEL SECURITY;

-- profiles: user can read/update their own profile
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
CREATE POLICY "Users can read own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- emergency_contacts: user manages their own
DROP POLICY IF EXISTS "Users can manage own contacts" ON public.emergency_contacts;
CREATE POLICY "Users can manage own contacts" ON public.emergency_contacts FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- guardian_links: user manages their own, guardians can read links to themselves
DROP POLICY IF EXISTS "Users can manage own guardian links" ON public.guardian_links;
CREATE POLICY "Users can manage own guardian links" ON public.guardian_links FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Guardians can view incoming links" ON public.guardian_links;
CREATE POLICY "Guardians can view incoming links" ON public.guardian_links FOR SELECT TO authenticated USING (auth.uid() = guardian_user_id);

-- journey_sessions: user manages their own
DROP POLICY IF EXISTS "Users can manage own journeys" ON public.journey_sessions;
CREATE POLICY "Users can manage own journeys" ON public.journey_sessions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- notification_events: user reads their own
DROP POLICY IF EXISTS "Users can read own notifications" ON public.notification_events;
CREATE POLICY "Users can read own notifications" ON public.notification_events FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Note: No anonymous access is granted by default, and service_role bypasses RLS so explicit policies for it are unnecessary.
