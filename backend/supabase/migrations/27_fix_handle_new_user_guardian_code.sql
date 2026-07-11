-- Migration 27: Fix handle_new_user trigger to allow guardian_code DEFAULT
-- 
-- This migration ensures the trigger function does NOT explicitly insert NULL
-- for guardian_code, allowing the column DEFAULT (migration 26) to apply.
--
-- ONLY APPLY THIS IF: The existing trigger explicitly includes guardian_code
-- in its INSERT statement. If the trigger already omits guardian_code, this
-- migration is not needed.
--
-- Before applying, run find_trigger_function.sql to check the current implementation.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Insert profile for new auth.users record
  -- NOTE: guardian_code is OMITTED from this INSERT so the column DEFAULT applies
  -- The DEFAULT was set in migration 26: generate_unique_guardian_code()
  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    phone,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'mobile_number', ''),
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;  -- Idempotency: handle duplicate inserts gracefully
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Don't fail the auth.users insert if profile creation fails
    -- Log the error and allow signup to succeed
    RAISE WARNING 'Failed to create profile for user %: % (SQLSTATE: %)', 
      NEW.id, SQLERRM, SQLSTATE;
    RETURN NEW;
END;
$$;

-- Ensure the trigger exists and is correctly attached
-- Drop and recreate to ensure it's up to date
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO postgres, service_role;

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';

-- Validation: Check that the function was created correctly
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'handle_new_user'
  ) THEN
    RAISE EXCEPTION 'Migration 27 failed: handle_new_user function not found';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'auth' 
      AND c.relname = 'users'
      AND t.tgname = 'on_auth_user_created'
  ) THEN
    RAISE EXCEPTION 'Migration 27 failed: on_auth_user_created trigger not found';
  END IF;
  
  RAISE NOTICE 'Migration 27 applied successfully: handle_new_user trigger updated';
END $$;
