-- 18_family_module_setup.sql

CREATE TABLE IF NOT EXISTS public.families (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_name TEXT NOT NULL CHECK (char_length(family_name) >= 1 AND char_length(family_name) <= 60),
    family_pin CHAR(6) NOT NULL UNIQUE,
    host_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for PIN lookups
CREATE INDEX IF NOT EXISTS idx_families_pin ON public.families(family_pin);
CREATE INDEX IF NOT EXISTS idx_families_host ON public.families(host_user_id);

CREATE TABLE IF NOT EXISTS public.family_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('host', 'member')),
    status TEXT NOT NULL CHECK (status IN ('active', 'removed', 'left')),
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_family_members_family_id ON public.family_members(family_id);
CREATE INDEX IF NOT EXISTS idx_family_members_user_id ON public.family_members(user_id);

-- Enforce "one active family per user" constraint
CREATE UNIQUE INDEX IF NOT EXISTS one_active_family_per_user ON public.family_members(user_id) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS public.family_join_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
    requester_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    responded_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_family_join_requests_family_id ON public.family_join_requests(family_id);
CREATE INDEX IF NOT EXISTS idx_family_join_requests_requester ON public.family_join_requests(requester_user_id);

-- Enforce "one pending request per family and user"
CREATE UNIQUE INDEX IF NOT EXISTS one_pending_request_per_user ON public.family_join_requests(family_id, requester_user_id) WHERE status = 'pending';

-- Offline Notifications Queue (specifically for family to not touch SOS/guardians stuff)
CREATE TABLE IF NOT EXISTS public.family_notification_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    payload JSONB,
    status TEXT NOT NULL DEFAULT 'queued', -- queued, sent, failed
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS POLICIES --

-- Enable RLS
ALTER TABLE public.families ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_join_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_notification_events ENABLE ROW LEVEL SECURITY;

-- families: 
-- SELECT allowed to users who are active members
DROP POLICY IF EXISTS "Active members can view family" ON public.families;
CREATE POLICY "Active members can view family" ON public.families FOR SELECT TO authenticated USING (
    EXISTS (
        SELECT 1 FROM public.family_members 
        WHERE family_members.family_id = id 
        AND family_members.user_id = auth.uid() 
        AND family_members.status = 'active'
    )
);

-- INSERT allowed to any authenticated user
DROP POLICY IF EXISTS "Any user can create family" ON public.families;
CREATE POLICY "Any user can create family" ON public.families FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = host_user_id
);

-- UPDATE/DELETE restricted to host
DROP POLICY IF EXISTS "Host can update family" ON public.families;
CREATE POLICY "Host can update family" ON public.families FOR UPDATE TO authenticated USING (
    auth.uid() = host_user_id
) WITH CHECK (
    auth.uid() = host_user_id
);

DROP POLICY IF EXISTS "Host can delete family" ON public.families;
CREATE POLICY "Host can delete family" ON public.families FOR DELETE TO authenticated USING (
    auth.uid() = host_user_id
);

-- family_members:
-- SELECT allowed only to active members of same family
DROP POLICY IF EXISTS "Active members can view family members" ON public.family_members;
CREATE POLICY "Active members can view family members" ON public.family_members FOR SELECT TO authenticated USING (
    EXISTS (
        SELECT 1 FROM public.family_members as self
        WHERE self.family_id = family_members.family_id
        AND self.user_id = auth.uid()
        AND self.status = 'active'
    )
);

-- UPDATE/DELETE restricted to host (removing others) or self (leaving)
DROP POLICY IF EXISTS "Host or self can update family members" ON public.family_members;
CREATE POLICY "Host or self can update family members" ON public.family_members FOR UPDATE TO authenticated USING (
    user_id = auth.uid() OR EXISTS (
        SELECT 1 FROM public.families WHERE id = family_members.family_id AND host_user_id = auth.uid()
    )
);

-- DELETE restricted to host or self
DROP POLICY IF EXISTS "Host or self can delete family members" ON public.family_members;
CREATE POLICY "Host or self can delete family members" ON public.family_members FOR DELETE TO authenticated USING (
    user_id = auth.uid() OR EXISTS (
        SELECT 1 FROM public.families WHERE id = family_members.family_id AND host_user_id = auth.uid()
    )
);

-- family_join_requests:
-- Requester can SELECT/INSERT their own rows.
DROP POLICY IF EXISTS "Requester can view own requests" ON public.family_join_requests;
CREATE POLICY "Requester can view own requests" ON public.family_join_requests FOR SELECT TO authenticated USING (
    requester_user_id = auth.uid()
);

DROP POLICY IF EXISTS "Requester can insert own requests" ON public.family_join_requests;
CREATE POLICY "Requester can insert own requests" ON public.family_join_requests FOR INSERT TO authenticated WITH CHECK (
    requester_user_id = auth.uid()
);

-- Host can SELECT/UPDATE rows for their family
DROP POLICY IF EXISTS "Host can view family requests" ON public.family_join_requests;
CREATE POLICY "Host can view family requests" ON public.family_join_requests FOR SELECT TO authenticated USING (
    EXISTS (
        SELECT 1 FROM public.families WHERE id = family_join_requests.family_id AND host_user_id = auth.uid()
    )
);

DROP POLICY IF EXISTS "Host can update family requests" ON public.family_join_requests;
CREATE POLICY "Host can update family requests" ON public.family_join_requests FOR UPDATE TO authenticated USING (
    EXISTS (
        SELECT 1 FROM public.families WHERE id = family_join_requests.family_id AND host_user_id = auth.uid()
    )
);

-- family_notification_events: User can read own. Insert via service role.
DROP POLICY IF EXISTS "Users can read own family notifications" ON public.family_notification_events;
CREATE POLICY "Users can read own family notifications" ON public.family_notification_events FOR SELECT TO authenticated USING (
    auth.uid() = user_id
);

-- Permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.families TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.family_members TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.family_join_requests TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.family_notification_events TO authenticated, service_role;
