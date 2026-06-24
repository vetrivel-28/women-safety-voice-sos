-- Create guardians table
CREATE TABLE IF NOT EXISTS public.guardians (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    relationship TEXT,
    priority INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create guardian_links table
CREATE TABLE IF NOT EXISTS public.guardian_links (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    guardian_id UUID REFERENCES public.profiles(user_id) ON DELETE CASCADE,
    status TEXT DEFAULT 'ACTIVE',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create sos_alerts table
CREATE TABLE IF NOT EXISTS public.sos_alerts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    trigger_type TEXT NOT NULL,
    status TEXT DEFAULT 'ACTIVE',
    location JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    resolved_at TIMESTAMP WITH TIME ZONE
);

-- Setup RLS
ALTER TABLE public.guardians ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guardian_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sos_alerts ENABLE ROW LEVEL SECURITY;

-- Guardians Policies
CREATE POLICY "Users can view own guardians" ON public.guardians FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own guardians" ON public.guardians FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own guardians" ON public.guardians FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own guardians" ON public.guardians FOR DELETE USING (auth.uid() = user_id);

-- Guardian Links Policies
CREATE POLICY "Users can view own links" ON public.guardian_links FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own links" ON public.guardian_links FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own links" ON public.guardian_links FOR DELETE USING (auth.uid() = user_id);

-- SOS Alerts Policies
CREATE POLICY "Users can view own alerts" ON public.sos_alerts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own alerts" ON public.sos_alerts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own alerts" ON public.sos_alerts FOR UPDATE USING (auth.uid() = user_id);
