CREATE OR REPLACE FUNCTION public.generate_unique_guardian_code()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  candidate text;
  tries integer := 0;
BEGIN
  LOOP
    candidate := lpad((floor(random() * 1000000))::int::text, 6, '0');

    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.profiles WHERE guardian_code = candidate
    );

    tries := tries + 1;
    IF tries > 50 THEN
      RAISE EXCEPTION 'Could not generate unique guardian code after 50 tries';
    END IF;
  END LOOP;

  RETURN candidate;
END;
$$;
