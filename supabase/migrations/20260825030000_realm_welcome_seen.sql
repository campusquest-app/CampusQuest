-- Persist first-entry Realm welcome + first-session nav hints.
-- Grandfather anyone who already finished onboarding so existing accounts
-- are not forced through the new arrival experience.

alter table public.profiles
  add column if not exists realm_welcome_seen_at timestamptz;

alter table public.profiles
  add column if not exists nav_hints_seen_at timestamptz;

comment on column public.profiles.realm_welcome_seen_at is
  'When set, suppresses the personalized first-entry Realm arrival; backfilled for existing completed accounts';

comment on column public.profiles.nav_hints_seen_at is
  'When set, hides temporary first-session dock labels; backfilled for existing completed accounts';

update public.profiles p
set
  realm_welcome_seen_at = coalesce(
    p.realm_welcome_seen_at,
    p.onboarding_completed_at,
    p.starter_intro_seen_at,
    now()
  ),
  nav_hints_seen_at = coalesce(
    p.nav_hints_seen_at,
    p.onboarding_completed_at,
    p.starter_intro_seen_at,
    now()
  )
where (
    p.realm_welcome_seen_at is null
    or p.nav_hints_seen_at is null
  )
  and (
    p.onboarding_completed = true
    or p.onboarding_character_completed = true
    or p.starter_intro_seen_at is not null
  );
