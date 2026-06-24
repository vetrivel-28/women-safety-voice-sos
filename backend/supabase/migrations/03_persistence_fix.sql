  -- Grants
  grant usage on schema public to service_role;
  grant select,insert,update,delete on all tables in schema public to service_role;
  grant usage,select on all sequences in schema public to service_role;
  grant usage on schema public to authenticated;
  grant select,insert,update,delete on public.profiles to authenticated;
  grant select,insert,update,delete on public.emergency_contacts to authenticated;
  grant select,insert,update,delete on public.guardian_links to authenticated;
  grant select,insert,update,delete on public.safe_windows to authenticated;
  grant select,insert,update,delete on public.sos_alerts to authenticated;
  -- Enums
  alter type public.trigger_type add value if not exists 'MANUAL_SOS';
  alter type public.trigger_type add value if not exists 'SILENT_SOS';
  alter type public.trigger_type add value if not exists 'JOURNEY_MISSED_CHECKIN';
  alter type public.safe_window_status add value if not exists 'active';
  alter type public.safe_window_status add value if not exists 'completed';
  alter type public.safe_window_status add value if not exists 'missed';
  -- safe_windows columns
  alter table public.safe_windows add column if not exists start_latitude double precision;
  alter table public.safe_windows add column if not exists start_longitude double precision;
  alter table public.safe_windows add column if not exists start_address text;
  alter table public.safe_windows add column if not exists destination_address text;
  alter table public.safe_windows add column if not exists completed_at timestamptz;
  alter table public.safe_windows add column if not exists missed_at timestamptz;
  -- sos_alerts columns
  alter table public.sos_alerts add column if not exists safe_window_id uuid references public.safe_windows(id) on delete set null;
  alter table public.sos_alerts add column if not exists message text;
