-- 15_safe_windows_osrm.sql
-- Add location tracking and OSRM route metadata to safe_windows table if not already present

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'safe_windows' AND column_name = 'start_place_id') THEN
        ALTER TABLE public.safe_windows ADD COLUMN start_place_id TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'safe_windows' AND column_name = 'destination_place_id') THEN
        ALTER TABLE public.safe_windows ADD COLUMN destination_place_id TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'safe_windows' AND column_name = 'location_provider') THEN
        ALTER TABLE public.safe_windows ADD COLUMN location_provider TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'safe_windows' AND column_name = 'distance_km') THEN
        ALTER TABLE public.safe_windows ADD COLUMN distance_km DOUBLE PRECISION;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'safe_windows' AND column_name = 'estimated_duration_minutes') THEN
        ALTER TABLE public.safe_windows ADD COLUMN estimated_duration_minutes INTEGER;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'safe_windows' AND column_name = 'estimated_arrival_at') THEN
        ALTER TABLE public.safe_windows ADD COLUMN estimated_arrival_at TIMESTAMPTZ;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'safe_windows' AND column_name = 'route_polyline') THEN
        ALTER TABLE public.safe_windows ADD COLUMN route_polyline TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'safe_windows' AND column_name = 'route_provider') THEN
        ALTER TABLE public.safe_windows ADD COLUMN route_provider TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'safe_windows' AND column_name = 'route_status') THEN
        ALTER TABLE public.safe_windows ADD COLUMN route_status TEXT;
    END IF;
END $$;
