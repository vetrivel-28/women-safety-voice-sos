-- 25_emergency_runtime_schema_fix.sql
-- Idempotent emergency runtime schema fix

-- A. Create public.trusted_places if missing
CREATE TABLE IF NOT EXISTS public.trusted_places (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    label TEXT,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    address TEXT,
    radius_meters INTEGER NOT NULL DEFAULT 100,
    notify_guardians_on_arrival BOOLEAN NOT NULL DEFAULT TRUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trusted_places_user_id ON public.trusted_places(user_id);
CREATE INDEX IF NOT EXISTS idx_trusted_places_user_active ON public.trusted_places(user_id, is_active);

ALTER TABLE public.trusted_places ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own trusted places" ON public.trusted_places;
CREATE POLICY "Users manage own trusted places"
    ON public.trusted_places FOR ALL TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trusted_places TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trusted_places TO authenticated;

-- B. Create public.family_member_locations if missing
CREATE TABLE IF NOT EXISTS public.family_member_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    accuracy DOUBLE PRECISION,
    status TEXT NOT NULL DEFAULT 'SAFE',
    source TEXT,
    sharing_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_family_member_location UNIQUE (family_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_family_member_locations_family ON public.family_member_locations(family_id);
CREATE INDEX IF NOT EXISTS idx_family_member_locations_user ON public.family_member_locations(user_id);
CREATE INDEX IF NOT EXISTS idx_family_member_locations_updated ON public.family_member_locations(updated_at DESC);

ALTER TABLE public.family_member_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Active members can view family locations" ON public.family_member_locations;
CREATE POLICY "Active members can view family locations"
    ON public.family_member_locations FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.family_members m
            WHERE m.family_id = family_member_locations.family_id
              AND m.user_id = auth.uid()
              AND m.status = 'active'
        )
    );

DROP POLICY IF EXISTS "Users manage own family location" ON public.family_member_locations;
CREATE POLICY "Users manage own family location"
    ON public.family_member_locations FOR ALL TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.family_member_locations TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.family_member_locations TO authenticated;

-- C. Alter public.safe_windows
ALTER TABLE public.safe_windows
    ADD COLUMN IF NOT EXISTS trusted_place_id UUID REFERENCES public.trusted_places(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS destination_name TEXT,
    ADD COLUMN IF NOT EXISTS destination_latitude DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS destination_longitude DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS destination_radius_meters INTEGER,
    ADD COLUMN IF NOT EXISTS notify_guardians_on_arrival BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS severity TEXT NOT NULL DEFAULT 'NORMAL',
    ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS escalated_reason TEXT,
    ADD COLUMN IF NOT EXISTS completed_reason TEXT,
    ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_escalation_notif_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS escalation_notif_count INTEGER NOT NULL DEFAULT 0;

-- E. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
