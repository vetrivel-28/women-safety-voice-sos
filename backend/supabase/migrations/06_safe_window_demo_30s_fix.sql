ALTER TABLE public.safe_windows
  ADD COLUMN IF NOT EXISTS check_in_interval_seconds INT;

UPDATE public.safe_windows
SET check_in_interval_seconds = COALESCE(
    check_in_interval_seconds,
    COALESCE(check_in_interval_minutes, 5) * 60
)
WHERE check_in_interval_seconds IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS one_active_safe_window_per_user
  ON public.safe_windows (user_id)
  WHERE status = 'active';
