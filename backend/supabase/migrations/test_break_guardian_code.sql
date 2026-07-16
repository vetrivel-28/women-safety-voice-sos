CREATE OR REPLACE FUNCTION public.generate_unique_guardian_code()
RETURNS text
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Simulated failure to prove atomicity';
END;
$$;
