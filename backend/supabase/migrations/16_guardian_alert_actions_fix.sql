-- 16_guardian_alert_actions_fix.sql
-- Ensure guardian_alert_actions table is correctly created

create table if not exists public.guardian_alert_actions (
  id uuid primary key default gen_random_uuid(),
  alert_id uuid not null,
  guardian_user_id uuid not null,
  protected_user_id uuid not null,
  journey_id uuid null,
  action_type text not null,
  message text null,
  status text default 'success',
  metadata jsonb null,
  created_at timestamptz default now()
);

create index if not exists guardian_alert_actions_alert_id_idx
on public.guardian_alert_actions(alert_id);

create index if not exists guardian_alert_actions_guardian_user_id_idx
on public.guardian_alert_actions(guardian_user_id);

create index if not exists guardian_alert_actions_protected_user_id_idx
on public.guardian_alert_actions(protected_user_id);
