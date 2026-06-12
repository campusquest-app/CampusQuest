-- XP milestone unlock tracking (one-time popups, server-authoritative).

create table if not exists public.unlocked_milestones (
  user_id uuid not null references public.profiles(id) on delete cascade,
  milestone_key text not null,
  unlocked_at timestamptz not null default now(),
  popup_shown_at timestamptz,
  primary key (user_id, milestone_key)
);

create index if not exists idx_unlocked_milestones_pending_popup
  on public.unlocked_milestones (user_id)
  where popup_shown_at is null;

alter table public.unlocked_milestones enable row level security;

drop policy if exists "unlocked_milestones read own" on public.unlocked_milestones;
create policy "unlocked_milestones read own"
  on public.unlocked_milestones for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "unlocked_milestones update own popup" on public.unlocked_milestones;
create policy "unlocked_milestones update own popup"
  on public.unlocked_milestones for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Users already past 300 XP should not get a late login popup.
insert into public.unlocked_milestones (user_id, milestone_key, unlocked_at, popup_shown_at)
select s.user_id, 'create_guild_300', now(), now()
from public.user_stats s
where s.total_xp >= 300
on conflict (user_id, milestone_key) do nothing;
