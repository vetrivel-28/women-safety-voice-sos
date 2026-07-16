-- 31_journey_location_updates.sql
-- Adds the journey_location_updates breadcrumb table and final-stats columns on safe_windows.
-- Idempotent: safe to re-run.
--
-- TODO (deferred, not in this migration):
--   Add a pg_cron job to delete breadcrumb rows older than 30 days after journey completion.
--   Rationale: at the 8s/15m throttle rate, a 60-min journey writes ~450 rows.
--   Aggregated final stats are written back to safe_windows on completion, so the
--   breadcrumb trail is not the sole durable record of a journey.


-- ============================================================
-- 1.  journey_location_updates  (breadcrumb trail)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.journey_location_updates (
    id          UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
    journey_id  UUID             NOT NULL
                                 REFERENCES public.safe_windows(id) ON DELETE CASCADE,
    user_id     UUID             NOT NULL
                                 REFERENCES public.profiles(id) ON DELETE CASCADE,
    lat         DOUBLE PRECISION NOT NULL,
    lng         DOUBLE PRECISION NOT NULL,
    heading     DOUBLE PRECISION,          -- degrees 0-360, nullable
    speed_ms    DOUBLE PRECISION,          -- m/s, nullable
    accuracy    DOUBLE PRECISION,
    recorded_at TIMESTAMPTZ      NOT NULL DEFAULT now()
);

-- Index for guardian live-map initial load (ordered breadcrumb trail per journey)
CREATE INDEX IF NOT EXISTS idx_jlu_journey_recorded
    ON public.journey_location_updates(journey_id, recorded_at DESC);

-- Index for ward self-query path
CREATE INDEX IF NOT EXISTS idx_jlu_user_recorded
    ON public.journey_location_updates(user_id, recorded_at DESC);


-- ============================================================
-- 2.  Row Level Security
-- ============================================================

ALTER TABLE public.journey_location_updates ENABLE ROW LEVEL SECURITY;

-- Ward inserts their own breadcrumb rows
DROP POLICY IF EXISTS "Ward inserts own location updates" ON public.journey_location_updates;
CREATE POLICY "Ward inserts own location updates"
    ON public.journey_location_updates FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- Ward reads their own breadcrumb trail
DROP POLICY IF EXISTS "Ward reads own location updates" ON public.journey_location_updates;
CREATE POLICY "Ward reads own location updates"
    ON public.journey_location_updates FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

-- Active guardian reads their ward's breadcrumb trail
DROP POLICY IF EXISTS "Guardian reads ward location updates" ON public.journey_location_updates;
CREATE POLICY "Guardian reads ward location updates"
    ON public.journey_location_updates FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM   public.guardian_links gl
            WHERE  gl.guardian_user_id = auth.uid()
              AND  gl.user_id          = journey_location_updates.user_id
              AND  gl.status           = 'ACTIVE'
        )
    );

-- service_role full access (backend writes via service role key)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.journey_location_updates TO service_role;
-- authenticated role: INSERT own rows + SELECT (governed by RLS above)
GRANT SELECT, INSERT ON public.journey_location_updates TO authenticated;


-- ============================================================
-- 3.  Enable Supabase Realtime replication on this table
-- ============================================================

-- Add the table to the supabase_realtime publication so postgres_changes
-- subscriptions can receive INSERT events from guardian clients.
-- This is idempotent: adding an already-published table is a no-op in PG.
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.journey_location_updates;
EXCEPTION
    WHEN duplicate_object THEN NULL;   -- already in the publication
    WHEN undefined_object THEN NULL;   -- publication doesn't exist (self-hosted without it)
END;
$$;


-- ============================================================
-- 4.  Final-stats columns on safe_windows
-- ============================================================

ALTER TABLE public.safe_windows
    ADD COLUMN IF NOT EXISTS final_distance_m       DOUBLE PRECISION,   -- metres, computed from breadcrumb trail
    ADD COLUMN IF NOT EXISTS final_duration_seconds INTEGER,             -- wall-clock journey duration
    ADD COLUMN IF NOT EXISTS avg_speed_kmh          DOUBLE PRECISION;   -- average speed km/h over journey


-- ============================================================
-- 5.  Reload PostgREST schema cache
-- ============================================================

NOTIFY pgrst, 'reload schema';
