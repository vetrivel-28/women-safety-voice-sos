-- 10_safe_windows_locations.sql
-- Add new location fields for Journey Mode using Google Places

ALTER TABLE public.safe_windows 
ADD COLUMN IF NOT EXISTS start_address TEXT;

ALTER TABLE public.safe_windows 
ADD COLUMN IF NOT EXISTS start_latitude DOUBLE PRECISION;

ALTER TABLE public.safe_windows 
ADD COLUMN IF NOT EXISTS start_longitude DOUBLE PRECISION;

ALTER TABLE public.safe_windows 
ADD COLUMN IF NOT EXISTS destination_address TEXT;

ALTER TABLE public.safe_windows 
ADD COLUMN IF NOT EXISTS destination_latitude DOUBLE PRECISION;

ALTER TABLE public.safe_windows 
ADD COLUMN IF NOT EXISTS destination_longitude DOUBLE PRECISION;

ALTER TABLE public.safe_windows 
ADD COLUMN IF NOT EXISTS destination_place_id TEXT;
