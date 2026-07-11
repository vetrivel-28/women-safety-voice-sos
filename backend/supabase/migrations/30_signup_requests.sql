CREATE TABLE IF NOT EXISTS public.signup_requests (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL,
    email TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.signup_requests ENABLE ROW LEVEL SECURITY;
