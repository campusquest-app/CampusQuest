-- CampusQuest onboarding demographics + engagement analytics foundation (v2)
-- Backward compatible: all new columns nullable / defaults; no NOT NULL without backfill.

-- Profiles: explicit student status, institution, onboarding version
alter table public.profiles
  add column if not exists student_status text
    check (student_status is null or student_status in ('current_or_incoming', 'not_student'));

alter table public.profiles
  add column if not exists institution_id text;

alter table public.profiles
  add column if not exists onboarding_version integer;

comment on column public.profiles.student_status is
  'Explicit onboarding answer: current_or_incoming | not_student. Not inferred from email.';
comment on column public.profiles.institution_id is
  'Stable institution id (e.g. uri). Display name lives in app taxonomy.';
comment on column public.profiles.onboarding_version is
  'Onboarding flow version completed (allows evolving screens without boolean abuse).';

create index if not exists idx_profiles_graduation_year
  on public.profiles (class_year)
  where class_year is not null;

create index if not exists idx_profiles_institution_id
  on public.profiles (institution_id)
  where institution_id is not null;

create index if not exists idx_profiles_student_status
  on public.profiles (student_status)
  where student_status is not null;

-- Preferences: optional communities/affiliations; widen interests length for new taxonomy
alter table public.user_onboarding_preferences
  add column if not exists communities text[] not null default '{}'::text[];

alter table public.user_onboarding_preferences
  add column if not exists institution_id text;

-- Interests length: empty OR 1–15 at DB layer (legacy rows may have 1–2).
-- Application enforces MIN_INTERESTS=3 on create/update via onboardingPreferencesSchema.
comment on column public.user_onboarding_preferences.communities is
  'Optional student affiliation IDs from onboarding taxonomy (explicit selection only).';

-- Drop old tight interests length checks and replace with wider bound (1–15)
do $$
declare
  r record;
begin
  for r in
    select conname
    from pg_constraint
    where conrelid = 'public.user_onboarding_preferences'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%interests%'
  loop
    execute format(
      'alter table public.user_onboarding_preferences drop constraint if exists %I',
      r.conname
    );
  end loop;
end $$;

alter table public.user_onboarding_preferences
  add constraint user_onboarding_preferences_interests_len
  check (
    coalesce(cardinality(interests), 0) = 0
    or (cardinality(interests) between 1 and 15)
  );

-- Engagement query helpers: indexes on existing source-of-truth tables
create index if not exists idx_quad_posts_user_created
  on public.quad_posts (user_id, created_at desc);

create index if not exists idx_quad_posts_created_at
  on public.quad_posts (created_at desc);

create index if not exists idx_event_rsvps_user_event
  on public.event_rsvps (user_id, event_id);

create index if not exists idx_event_rsvps_created_at
  on public.event_rsvps (created_at desc);

create index if not exists idx_qr_scans_user_scanned
  on public.qr_scans (user_id, scanned_at desc)
  where status = 'success';
