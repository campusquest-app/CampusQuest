-- Persist character setup + onboarding completion on profiles (server source of truth).
-- Major stored on user_onboarding_preferences (discovery step).

alter table public.profiles
  add column if not exists onboarding_completed boolean not null default false,
  add column if not exists onboarding_completed_at timestamptz,
  add column if not exists onboarding_character_completed boolean not null default false,
  add column if not exists avatar_custom_json text check (avatar_custom_json is null or char_length(avatar_custom_json) <= 120000),
  add column if not exists character_class_id text,
  add column if not exists starter_weapon text,
  add column if not exists scholar_guild_id text;

alter table public.user_onboarding_preferences
  add column if not exists major text check (major is null or char_length(trim(major)) between 2 and 120);

-- Returning users who already saved discovery prefs (pre-profile-onboarding-era) treated as fully onboarded.
update public.profiles p
set
  onboarding_character_completed = true,
  onboarding_completed = true,
  onboarding_completed_at = coalesce(p.onboarding_completed_at, u.completed_at, now())
from public.user_onboarding_preferences u
where u.user_id = p.id;
