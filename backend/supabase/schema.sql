-- Create custom types
CREATE TYPE alert_status AS ENUM ('ACTIVE', 'CANCELLED', 'SILENT_DURESS_ACTIVE', 'RESOLVED');
CREATE TYPE trigger_type AS ENUM ('MANUAL_SOS', 'SILENT_SOS');
CREATE TYPE safe_window_status AS ENUM ('INACTIVE', 'ACTIVE', 'COMPLETED', 'MISSED_CHECKIN');
CREATE TYPE guardian_status AS ENUM ('PENDING', 'ACTIVE', 'REVOKED');

-- Profiles Table
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE POLICY "Users can create own profile"
ON profiles
FOR INSERT
WITH CHECK (auth.uid() = id);

-- Emergency Contacts Table
CREATE TABLE emergency_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    relationship TEXT,
    priority INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Guardian Links Table
CREATE TABLE guardian_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    guardian_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    status guardian_status DEFAULT 'PENDING',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, guardian_id)
);

-- SOS Alerts Table
CREATE TABLE sos_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    trigger_type trigger_type NOT NULL,
    status alert_status NOT NULL,
    visible_message TEXT NOT NULL,
    cancel_method TEXT,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    location_lat DOUBLE PRECISION,
    location_long DOUBLE PRECISION,
    location_accuracy DOUBLE PRECISION,
    location_map_link TEXT,
    location_captured_at TIMESTAMP WITH TIME ZONE,
    location_permission_denied BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Safe Windows Table
CREATE TABLE safe_windows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    status safe_window_status NOT NULL,
    duration_minutes INTEGER,
    started_at TIMESTAMP WITH TIME ZONE,
    ends_at TIMESTAMP WITH TIME ZONE,
    check_in_due_at TIMESTAMP WITH TIME ZONE,
    last_check_in_at TIMESTAMP WITH TIME ZONE,
    missed_check_in_at TIMESTAMP WITH TIME ZONE,
    demo_mode BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_emergency_contacts_user_id ON emergency_contacts(user_id);
CREATE INDEX idx_sos_alerts_user_id ON sos_alerts(user_id);
CREATE INDEX idx_guardian_links_user_id ON guardian_links(user_id);
CREATE INDEX idx_guardian_links_guardian_id ON guardian_links(guardian_id);
CREATE INDEX idx_safe_windows_user_id ON safe_windows(user_id);

-- Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE emergency_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE guardian_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE sos_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE safe_windows ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Profiles: Users can read and update their own profile.
CREATE POLICY "Users can read own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Emergency Contacts: Users can CRUD their own contacts.
CREATE POLICY "Users can manage own contacts" ON emergency_contacts FOR ALL USING (auth.uid() = user_id);

-- Guardian Links: 
-- Users can manage links where they are the protectee (user_id).
-- Guardians can read links where they are the guardian (guardian_id).
CREATE POLICY "Users can manage their guardian links" ON guardian_links FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Guardians can view their links" ON guardian_links FOR SELECT USING (auth.uid() = guardian_id);

-- SOS Alerts: 
-- Users can manage their own alerts.
-- Active guardians can read alerts for their protectees.
CREATE POLICY "Users can manage own alerts" ON sos_alerts FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Guardians can view protectee alerts" ON sos_alerts FOR SELECT USING (
    user_id IN (
        SELECT user_id FROM guardian_links 
        WHERE guardian_id = auth.uid() AND status = 'ACTIVE'
    )
);

-- Safe Windows:
-- Users can manage their own safe windows.
-- Active guardians can read safe windows for their protectees.
CREATE POLICY "Users can manage own safe windows" ON safe_windows FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Guardians can view protectee safe windows" ON safe_windows FOR SELECT USING (
    user_id IN (
        SELECT user_id FROM guardian_links 
        WHERE guardian_id = auth.uid() AND status = 'ACTIVE'
    )
);

-- Schema fix discovered during Stage A validation: Grant privileges to authenticated role
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE emergency_contacts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE guardian_links TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE sos_alerts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE safe_windows TO authenticated;
