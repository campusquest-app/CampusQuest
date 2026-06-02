-- CampusQuest QR tables bootstrap (idempotent).
-- Run this if public.qr_codes / public.qr_scans are missing from your Supabase project.
-- Does not modify quest_locations, qr_scan_logs, or other existing tables.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- profiles.role (QR permissions)
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists role text not null default 'student';

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('student', 'admin', 'super_admin'));

create index if not exists profiles_role_idx on public.profiles (role);

update public.profiles p
set role = 'super_admin'
from auth.users u
where p.id = u.id
  and lower(u.email) = lower('nicklockhart22@uri.edu');

-- ---------------------------------------------------------------------------
-- qr_codes
-- ---------------------------------------------------------------------------
create table if not exists public.qr_codes (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  title text not null,
  description text,
  type text not null default 'permanent_location',
  location_name text,
  activity_name text,
  xp_reward integer not null default 0,
  is_active boolean not null default true,
  is_permanent boolean not null default false,
  cooldown_hours integer not null default 24,
  max_scans_per_day integer not null default 1,
  expires_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

-- Optional columns used by the app (safe if table already existed from older migrations)
alter table public.qr_codes add column if not exists activity_name text;
alter table public.qr_codes add column if not exists event_id uuid;
alter table public.qr_codes add column if not exists quest_id uuid;
alter table public.qr_codes add column if not exists requires_staff_approval boolean not null default false;
alter table public.qr_codes add column if not exists is_permanent boolean not null default false;

create index if not exists qr_codes_code_idx on public.qr_codes (code);
create index if not exists qr_codes_active_idx on public.qr_codes (is_active) where is_active = true;

-- ---------------------------------------------------------------------------
-- qr_scans
-- ---------------------------------------------------------------------------
create table if not exists public.qr_scans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  qr_code_id uuid not null references public.qr_codes (id) on delete cascade,
  scanned_at timestamptz not null default now(),
  xp_awarded integer not null default 0,
  status text not null default 'success',
  failure_reason text
);

alter table public.qr_scans add column if not exists device_hint text;

alter table public.qr_scans
  drop constraint if exists qr_scans_status_check;

alter table public.qr_scans
  add constraint qr_scans_status_check
  check (status in ('success', 'failed', 'admin_bypass'));

create index if not exists qr_scans_user_qr_idx
  on public.qr_scans (user_id, qr_code_id, scanned_at desc);

create index if not exists qr_scans_user_idx
  on public.qr_scans (user_id, scanned_at desc);

-- ---------------------------------------------------------------------------
-- Seed: URI Gym (GYM)
-- ---------------------------------------------------------------------------
insert into public.qr_codes (
  code,
  title,
  description,
  type,
  location_name,
  activity_name,
  xp_reward,
  is_active,
  is_permanent,
  cooldown_hours,
  max_scans_per_day,
  expires_at
)
values (
  'GYM',
  'URI Gym Check-In',
  'Check in at the URI Gym and build your strength streak.',
  'permanent_location',
  'URI Gym',
  'Hitting the Gym',
  80,
  true,
  true,
  24,
  1,
  null
)
on conflict (code) do update set
  title = excluded.title,
  description = excluded.description,
  type = excluded.type,
  location_name = excluded.location_name,
  activity_name = excluded.activity_name,
  xp_reward = excluded.xp_reward,
  is_active = excluded.is_active,
  is_permanent = excluded.is_permanent,
  cooldown_hours = excluded.cooldown_hours,
  max_scans_per_day = excluded.max_scans_per_day,
  expires_at = excluded.expires_at;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.qr_codes enable row level security;
alter table public.qr_scans enable row level security;

drop policy if exists "Students can read active qr codes" on public.qr_codes;
create policy "Students can read active qr codes"
  on public.qr_codes
  for select
  to authenticated
  using (is_active = true);

drop policy if exists qr_codes_admin_all on public.qr_codes;
create policy qr_codes_admin_all
  on public.qr_codes
  for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'super_admin')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'super_admin')
    )
  );

drop policy if exists "Users can insert own qr scans" on public.qr_scans;
create policy "Users can insert own qr scans"
  on public.qr_scans
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can view own qr scans" on public.qr_scans;
create policy "Users can view own qr scans"
  on public.qr_scans
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists qr_scans_admin_select on public.qr_scans;
create policy qr_scans_admin_select
  on public.qr_scans
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'super_admin')
    )
  );

-- ---------------------------------------------------------------------------
-- Admin helper (optional; used by some RLS policies)
-- ---------------------------------------------------------------------------
create or replace function public.is_cq_qr_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin', 'super_admin')
  );
$$;

grant execute on function public.is_cq_qr_admin() to authenticated;
