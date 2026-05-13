-- First-time onboarding preferences for personalization

create table if not exists public.user_onboarding_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  school_name text not null check (char_length(school_name) between 2 and 120),
  interests text[] not null default '{}'::text[],
  discovery_focus text[] not null default '{}'::text[],
  completed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (array_length(interests, 1) between 1 and 8),
  check (array_length(discovery_focus, 1) between 1 and 3)
);

create index if not exists idx_user_onboarding_preferences_school
  on public.user_onboarding_preferences(school_name);

drop trigger if exists trg_user_onboarding_preferences_updated_at on public.user_onboarding_preferences;
create trigger trg_user_onboarding_preferences_updated_at
before update on public.user_onboarding_preferences
for each row execute function public.set_updated_at();

alter table public.user_onboarding_preferences enable row level security;

drop policy if exists "user_onboarding_preferences read own" on public.user_onboarding_preferences;
create policy "user_onboarding_preferences read own"
on public.user_onboarding_preferences for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "user_onboarding_preferences upsert own" on public.user_onboarding_preferences;
create policy "user_onboarding_preferences upsert own"
on public.user_onboarding_preferences for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "user_onboarding_preferences update own" on public.user_onboarding_preferences;
create policy "user_onboarding_preferences update own"
on public.user_onboarding_preferences for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
