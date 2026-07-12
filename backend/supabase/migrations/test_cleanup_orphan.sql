-- Scoped cleanup for orphaned test account only
-- 2403717673821008@cit.edu.in
-- 917959e6-781e-48a3-b208-1f767e202464

DO $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM auth.users WHERE id = '917959e6-781e-48a3-b208-1f767e202464' AND email = '2403717673821008@cit.edu.in';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  IF deleted_count = 0 THEN
    RAISE EXCEPTION 'Target user 917959e6-781e-48a3-b208-1f767e202464 not found or already deleted. Cleanup failed.';
  END IF;
  RAISE NOTICE 'Successfully deleted user %', '917959e6-781e-48a3-b208-1f767e202464';
END $$;
