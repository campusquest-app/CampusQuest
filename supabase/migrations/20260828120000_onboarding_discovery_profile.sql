-- CampusQuest onboarding discovery fields (backwards compatible).
-- Reuses profiles.major. Does not rewrite existing onboarding_version values.

alter table public.profiles
  add column if not exists academic_area text;

alter table public.profiles
  add column if not exists requested_school_name text;

alter table public.profiles
  add column if not exists requested_school_at timestamptz;

alter table public.profiles
  add column if not exists realm_intro_completed_at timestamptz;

comment on column public.profiles.academic_area is
  'Optional broad academic-area ID from onboarding (e.g. engineering, undecided).';
comment on column public.profiles.requested_school_name is
  'Unsupported-campus demand capture when a student cannot find their school.';
comment on column public.profiles.requested_school_at is
  'When requested_school_name was last submitted.';
comment on column public.profiles.realm_intro_completed_at is
  'When the first-use Realm coach marks were completed or skipped.';

-- Grandfather: anyone who already saw the previous Realm arrival should not
-- receive the new 3-step intro on next launch.
update public.profiles
set realm_intro_completed_at = realm_welcome_seen_at
where realm_intro_completed_at is null
  and realm_welcome_seen_at is not null;

create table if not exists public.onboarding_funnel_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_name text not null,
  step_number integer,
  elapsed_ms integer,
  skipped boolean,
  created_at timestamptz not null default now()
);

create index if not exists idx_onboarding_funnel_user_created
  on public.onboarding_funnel_events (user_id, created_at desc);

alter table public.onboarding_funnel_events enable row level security;

drop policy if exists onboarding_funnel_events_insert_own on public.onboarding_funnel_events;
create policy onboarding_funnel_events_insert_own
  on public.onboarding_funnel_events
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists onboarding_funnel_events_select_own on public.onboarding_funnel_events;
create policy onboarding_funnel_events_select_own
  on public.onboarding_funnel_events
  for select
  to authenticated
  using (auth.uid() = user_id);
