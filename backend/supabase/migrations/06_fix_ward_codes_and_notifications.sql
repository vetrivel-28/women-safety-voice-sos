-- DEV/DEMO MIGRATION: force guardian_code to 6-digit ward codes

alter table public.profiles
add column if not exists guardian_code text;

-- Drop old incompatible constraints/indexes if they exist.
do $$
declare
  r record;
begin
  for r in
    select conname
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
    and conname in (
      'profiles_guardian_code_format_chk',
      'profiles_ward_code_format_chk'
    )
  loop
    execute format('alter table public.profiles drop constraint if exists %I', r.conname);
  end loop;
end $$;

drop index if exists public.profiles_guardian_code_unique_idx;
drop index if exists public.profiles_ward_code_unique_idx;

-- helper function to generate collision-safe 6 digit code
create or replace function public.generate_unique_guardian_code()
returns text
language plpgsql
as $$
declare
  candidate text;
  tries integer := 0;
begin
  loop
    candidate := lpad((floor(random() * 1000000))::int::text, 6, '0');

    exit when not exists (
      select 1 from public.profiles where guardian_code = candidate
    );

    tries := tries + 1;
    if tries > 50 then
      raise exception 'Could not generate unique guardian code after 50 tries';
    end if;
  end loop;

  return candidate;
end;
$$;

-- Replace every invalid/null/non-6-digit code.
do $$
declare
  r record;
  new_code text;
begin
  for r in
    select id, guardian_code
    from public.profiles
    where guardian_code is null
       or guardian_code !~ '^[0-9]{6}$'
  loop
    new_code := public.generate_unique_guardian_code();

    update public.profiles
    set guardian_code = new_code
    where id = r.id;
  end loop;
end $$;

-- Add final constraints.
alter table public.profiles
alter column guardian_code set not null;

alter table public.profiles
add constraint profiles_guardian_code_format_chk
check (guardian_code ~ '^[0-9]{6}$');

create unique index profiles_guardian_code_unique_idx
on public.profiles (guardian_code);

-- PHASE 6: Create dedicated in_app_notifications table
create table if not exists public.in_app_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  actor_user_id uuid references public.profiles(id) on delete set null,
  alert_id uuid references public.sos_alerts(id) on delete cascade,
  journey_id uuid references public.safe_windows(id) on delete set null,
  type text not null,
  title text not null,
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_in_app_notifications_user_created
on public.in_app_notifications(user_id, created_at desc);

create index if not exists idx_in_app_notifications_user_unread
on public.in_app_notifications(user_id)
where read_at is null;

notify pgrst, 'reload schema';
