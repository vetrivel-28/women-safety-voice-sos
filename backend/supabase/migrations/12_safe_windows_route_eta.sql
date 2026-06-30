-- 12_safe_windows_route_eta.sql
-- Add distance, ETA, and route status tracking to public.safe_windows

ALTER TABLE public.safe_windows
ADD COLUMN IF NOT EXISTS distance_km DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS estimated_duration_minutes INTEGER,
ADD COLUMN IF NOT EXISTS estimated_arrival_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS route_polyline TEXT,
ADD COLUMN IF NOT EXISTS route_provider TEXT,
ADD COLUMN IF NOT EXISTS route_status TEXT;
