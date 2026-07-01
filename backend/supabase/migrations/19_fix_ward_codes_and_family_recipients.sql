-- 19_fix_ward_codes_and_family_recipients.sql
-- Idempotent fix for ward code column and safety recipient readiness.
-- Run manually in Supabase SQL editor.

-- 1. Ensure guardian_code column exists on profiles (safe if already present)
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS guardian_code TEXT;

-- 2. Drop and recreate the generate_unique_guardian_code function (collision-safe)
CREATE OR REPLACE FUNCTION public.generate_unique_guardian_code()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  candidate TEXT;
  tries INTEGER := 0;
BEGIN
  LOOP
    candidate := lpad((floor(random() * 1000000))::INT::TEXT, 6, '0');
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.profiles WHERE guardian_code = candidate
    );
    tries := tries + 1;
    IF tries > 100 THEN
      RAISE EXCEPTION 'Could not generate unique guardian_code after 100 tries';
    END IF;
  END LOOP;
  RETURN candidate;
END;
$$;

-- 3. Fix all profiles that have NULL, empty, SH- prefix, or non-6-digit guardian_code
DO $$
DECLARE
  r RECORD;
  new_code TEXT;
BEGIN
  FOR r IN
    SELECT id, guardian_code
    FROM public.profiles
    WHERE guardian_code IS NULL
       OR guardian_code = ''
       OR guardian_code !~ '^[0-9]{6}$'
  LOOP
    new_code := public.generate_unique_guardian_code();
    UPDATE public.profiles
    SET guardian_code = new_code
    WHERE id = r.id;
  END LOOP;
END $$;

-- 4. Enforce NOT NULL and format constraint (idempotent)
ALTER TABLE public.profiles
ALTER COLUMN guardian_code SET NOT NULL;

-- Drop old/conflicting constraints first
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.profiles'::REGCLASS
    AND conname = 'profiles_guardian_code_format_chk'
  ) THEN
    ALTER TABLE public.profiles DROP CONSTRAINT profiles_guardian_code_format_chk;
  END IF;
END $$;

ALTER TABLE public.profiles
ADD CONSTRAINT profiles_guardian_code_format_chk CHECK (guardian_code ~ '^[0-9]{6}$');

-- 5. Unique index (idempotent)
CREATE UNIQUE INDEX IF NOT EXISTS profiles_guardian_code_unique_idx
ON public.profiles (guardian_code);

-- 6. Grant permissions on family tables if not already done
GRANT SELECT, INSERT, UPDATE, DELETE ON public.families TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.family_members TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.family_join_requests TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.family_notification_events TO authenticated, service_role;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
