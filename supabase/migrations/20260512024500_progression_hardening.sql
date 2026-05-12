-- Progression hardening for quest/xp MVP flow

alter table public.profiles
  add column if not exists streak_days integer not null default 0 check (streak_days >= 0),
  add column if not exists last_activity_date date;

alter table public.user_stats
  add column if not exists quests_completed integer not null default 0 check (quests_completed >= 0);

alter table public.xp_logs
  add column if not exists source_id uuid;

create unique index if not exists idx_quest_completions_unique_user_quest
  on public.quest_completions(user_quest_id)
  where user_quest_id is not null;

