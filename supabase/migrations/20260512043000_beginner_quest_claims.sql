-- Beginner onboarding quest claim protection + backend XP source

create table if not exists public.user_beginner_quest_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  quest_key text not null check (quest_key in ('profile', 'activity', 'boss', 'leaderboard', 'guild')),
  xp_awarded integer not null check (xp_awarded > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, quest_key)
);

create index if not exists idx_user_beginner_quest_claims_user_created
  on public.user_beginner_quest_claims(user_id, created_at desc);

drop trigger if exists trg_user_beginner_quest_claims_updated_at on public.user_beginner_quest_claims;
create trigger trg_user_beginner_quest_claims_updated_at
before update on public.user_beginner_quest_claims
for each row execute function public.set_updated_at();

alter table public.user_beginner_quest_claims enable row level security;

drop policy if exists "user_beginner_quest_claims manage own" on public.user_beginner_quest_claims;
create policy "user_beginner_quest_claims manage own"
on public.user_beginner_quest_claims for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

