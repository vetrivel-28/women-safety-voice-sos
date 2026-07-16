-- Migration 29: Make handle_new_user strictly atomic
-- Removes the EXCEPTION WHEN OTHERS block so that profile creation failures
-- roll back the entire auth.users insert transaction.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Insert profile for new auth.users record
  -- guardian_code is omitted, allowing the database column DEFAULT to apply
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
  ON CONFLICT (id) DO NOTHING;
  
  RETURN NEW;
  -- The EXCEPTION block is intentionally removed to ensure atomicity.
  -- If profile creation fails, the auth.users insert will fail and roll back.
END;
$$;
