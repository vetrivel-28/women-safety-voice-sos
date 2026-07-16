-- Add family_member_locations to the realtime publication
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.family_member_locations;
EXCEPTION
    WHEN duplicate_object THEN NULL;   -- already in the publication
    WHEN undefined_object THEN NULL;   -- publication doesn't exist
END $$;
