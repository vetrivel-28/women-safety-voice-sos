-- Create custom types for ENUMs
CREATE TYPE alert_status AS ENUM ('ACTIVE', 'CANCELLED', 'SILENT_DURESS_ACTIVE', 'RESOLVED');
CREATE TYPE trigger_type AS ENUM ('MANUAL_SOS', 'SILENT_SOS');
CREATE TYPE cancel_method AS ENUM ('REAL_PIN', 'DURESS_PIN', 'NONE');

-- Users Table
CREATE TABLE users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    phone TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Guardians Table
CREATE TABLE guardians (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    phone TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User Guardian Links Table
CREATE TABLE user_guardian_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    guardian_id UUID NOT NULL REFERENCES guardians(id) ON DELETE CASCADE,
    is_primary BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, guardian_id)
);

-- SOS Alerts Table
CREATE TABLE sos_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    trigger_type trigger_type NOT NULL,
    status alert_status NOT NULL,
    cancel_method cancel_method DEFAULT 'NONE',
    visible_message TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    map_link TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    cancelled_at TIMESTAMP WITH TIME ZONE
);

-- Enable Row Level Security (RLS) on every table
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE guardians ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_guardian_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE sos_alerts ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Users: Can read only their own row. Can update only their own row. Cannot access other users.
CREATE POLICY "Users can read own profile" ON users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON users FOR UPDATE USING (auth.uid() = id);

-- Guardians: Can read only their own row. Can update only their own row.
CREATE POLICY "Guardians can read own profile" ON guardians FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Guardians can update own profile" ON guardians FOR UPDATE USING (auth.uid() = id);

-- User Guardian Links: 
-- Users can read links where they are the user_id.
CREATE POLICY "Users can view their links" ON user_guardian_links FOR SELECT USING (auth.uid() = user_id);
-- Guardians can read links where they are the guardian_id.
CREATE POLICY "Guardians can view their links" ON user_guardian_links FOR SELECT USING (auth.uid() = guardian_id);

-- SOS Alerts:
-- Users can read and insert their own alerts.
CREATE POLICY "Users can read own alerts" ON sos_alerts FOR SELECT USING (auth.uid() = user_id);
-- Insert is not allowed for users directly from client because endpoint uses service_role, but for safety:
-- CREATE POLICY "Users can insert own alerts" ON sos_alerts FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Guardians can only read alerts belonging to linked users. Must never see unrelated alerts.
CREATE POLICY "Guardians can read linked user alerts" ON sos_alerts FOR SELECT USING (
    user_id IN (
        SELECT user_id FROM user_guardian_links 
        WHERE guardian_id = auth.uid()
    )
);

-- Grant appropriate permissions to the authenticated role
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE users TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE guardians TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE user_guardian_links TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE sos_alerts TO authenticated;
