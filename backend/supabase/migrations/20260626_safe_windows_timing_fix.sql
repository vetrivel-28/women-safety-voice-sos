ALTER TABLE public.safe_windows
  ADD COLUMN IF NOT EXISTS check_in_interval_minutes INT DEFAULT 5,
  ADD COLUMN IF NOT EXISTS check_in_due_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_check_in_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS missed_check_in_at TIMESTAMPTZ;

-- Backfill existing active rows only
UPDATE public.safe_windows
SET ends_at = COALESCE(ends_at,
      started_at + (COALESCE(duration_seconds, duration_minutes * 60) * INTERVAL '1 second'))
WHERE status = 'active' AND ends_at IS NULL;

UPDATE public.safe_windows
SET last_check_in_at = COALESCE(last_check_in_at, started_at)
WHERE status = 'active' AND last_check_in_at IS NULL;

UPDATE public.safe_windows
SET check_in_due_at = COALESCE(check_in_due_at,
      LEAST(started_at + (COALESCE(check_in_interval_minutes, 5) * INTERVAL '1 minute'), COALESCE(ends_at, started_at + (COALESCE(duration_seconds, duration_minutes * 60) * INTERVAL '1 second'))))
WHERE status = 'active' AND check_in_due_at IS NULL;
