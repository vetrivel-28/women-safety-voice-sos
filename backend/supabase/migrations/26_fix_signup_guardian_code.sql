-- Migration 26: Fix guardian_code default to prevent signup failure
-- The guardian_code column was set to NOT NULL in migration 19.
-- This causes the auth.users signup trigger to fail with ""Database error saving new user""
-- if no guardian_code is provided during user creation.
-- By setting the default to generate_unique_guardian_code(), the trigger will succeed.

ALTER TABLE public.profiles
ALTER COLUMN guardian_code SET DEFAULT public.generate_unique_guardian_code();
