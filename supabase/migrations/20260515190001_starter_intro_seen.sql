-- Persist "New Player Protocol" intro dismissal across devices/browsers.
-- Depends on beginner_chain_* columns added in 20260515180000.

alter table public.profiles
  add column if not exists starter_intro_seen_at timestamptz;

comment on column public.profiles.starter_intro_seen_at is
  'When set, suppresses beginner starter intro overlay; inferred for returning users on backfill';

-- Returning users who already cleared onboarding chain or prefs pick up suppression without flashing on a new browser.
update public.profiles p
set starter_intro_seen_at = coalesce(
  p.starter_intro_seen_at,
  p.beginner_chain_celebration_seen_at,
  p.beginner_chain_completed_at,
  p.onboarding_completed_at
)
where p.starter_intro_seen_at is null
  and (
    p.onboarding_completed = true
    or p.beginner_chain_celebration_seen_at is not null
    or p.beginner_chain_completed_at is not null
  );
