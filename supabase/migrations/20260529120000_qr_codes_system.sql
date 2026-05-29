-- CampusQuest secure QR codes (events, quests, permanent locations)
-- Extends profiles with role; does not replace quest_locations / qr_scan_logs.

alter table public.profiles
  add column if not exists role text not null default 'student';

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('student', 'admin', 'super_admin'));

create index if not exists profiles_role_idx on public.profiles (role);

create table if not exists public.qr_codes (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  title text not null,
  description text,
  type text not null,
  event_id uuid references public.campus_events (id) on delete set null,
  quest_id uuid references public.quests (id) on delete set null,
  location_name text,
  xp_reward integer not null default 0,
  is_active boolean not null default true,
  is_permanent boolean not null default false,
  cooldown_hours integer not null default 24,
  max_scans_per_day integer not null default 1,
  requires_staff_approval boolean not null default false,
  expires_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint qr_codes_type_check check (
    type in ('event', 'quest', 'permanent_location', 'tutoring', 'advising')
  ),
  constraint qr_codes_xp_reward_nonneg check (xp_reward >= 0),
  constraint qr_codes_cooldown_nonneg check (cooldown_hours >= 0),
  constraint qr_codes_max_scans_nonneg check (max_scans_per_day >= 0)
);

create index if not exists qr_codes_code_idx on public.qr_codes (code);
create index if not exists qr_codes_active_idx on public.qr_codes (is_active) where is_active = true;
create index if not exists qr_codes_type_idx on public.qr_codes (type);

create table if not exists public.qr_scans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  qr_code_id uuid not null references public.qr_codes (id) on delete cascade,
  scanned_at timestamptz not null default now(),
  xp_awarded integer not null default 0,
  status text not null default 'success',
  failure_reason text,
  device_hint text,
  constraint qr_scans_status_check check (
    status in ('success', 'failed', 'admin_bypass')
  )
);

create index if not exists qr_scans_user_idx on public.qr_scans (user_id, scanned_at desc);
create index if not exists qr_scans_qr_user_idx on public.qr_scans (qr_code_id, user_id, scanned_at desc);

create table if not exists public.qr_suspicious_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  qr_code_id uuid references public.qr_codes (id) on delete set null,
  pattern text not null,
  detail jsonb,
  created_at timestamptz not null default now()
);

create index if not exists qr_suspicious_events_created_idx on public.qr_suspicious_events (created_at desc);

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

alter table public.qr_codes enable row level security;
alter table public.qr_scans enable row level security;
alter table public.qr_suspicious_events enable row level security;

drop policy if exists qr_codes_select_active on public.qr_codes;
create policy qr_codes_select_active
  on public.qr_codes
  for select
  to authenticated
  using (is_active = true);

drop policy if exists qr_codes_admin_all on public.qr_codes;
create policy qr_codes_admin_all
  on public.qr_codes
  for all
  to authenticated
  using (public.is_cq_qr_admin())
  with check (public.is_cq_qr_admin());

drop policy if exists qr_scans_select_own on public.qr_scans;
create policy qr_scans_select_own
  on public.qr_scans
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists qr_scans_insert_own on public.qr_scans;
create policy qr_scans_insert_own
  on public.qr_scans
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists qr_scans_admin_select on public.qr_scans;
create policy qr_scans_admin_select
  on public.qr_scans
  for select
  to authenticated
  using (public.is_cq_qr_admin());

drop policy if exists qr_suspicious_admin_select on public.qr_suspicious_events;
create policy qr_suspicious_admin_select
  on public.qr_suspicious_events
  for select
  to authenticated
  using (public.is_cq_qr_admin());

-- Super admin bootstrap (CampusQuest operator account)
update public.profiles p
set role = 'super_admin'
from auth.users u
where p.id = u.id
  and lower(u.email) = lower('nicklockhart22@uri.edu');

-- Sample / pilot QR codes (secure opaque tokens)
insert into public.qr_codes (
  code,
  title,
  description,
  type,
  location_name,
  xp_reward,
  is_active,
  is_permanent,
  cooldown_hours,
  max_scans_per_day,
  expires_at
)
values
  (
    'cq_perm_gym_v1',
    'Gym Check-In',
    'Permanent gym location check-in for milestone progress.',
    'permanent_location',
    'Gym',
    10,
    true,
    true,
    24,
    1,
    null
  ),
  (
    'cq_perm_library_v1',
    'Library Study Spot',
    'Permanent library study check-in.',
    'permanent_location',
    'Library',
    10,
    true,
    true,
    24,
    1,
    null
  ),
  (
    'cq_perm_union_v1',
    'Student Union Visit',
    'Permanent student union visit check-in.',
    'permanent_location',
    'Student Union',
    5,
    true,
    true,
    24,
    1,
    null
  ),
  (
    'cq_perm_tutoring_v1',
    'Tutoring Center Check-In',
    'Weekly tutoring center visit.',
    'tutoring',
    'Tutoring Center',
    25,
    true,
    true,
    168,
    1,
    null
  ),
  (
    'cq_event_td_pilot_v1',
    'TD Pilot Welcome Check-In',
    'TD pilot welcome event check-in.',
    'event',
    null,
    50,
    true,
    false,
    0,
    1,
    '2026-07-31T23:59:59+00:00'::timestamptz
  )
on conflict (code) do nothing;
