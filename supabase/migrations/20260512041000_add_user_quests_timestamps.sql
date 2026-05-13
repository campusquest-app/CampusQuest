alter table public.user_quests
add column if not exists started_at timestamptz default now();

alter table public.user_quests
add column if not exists completed_at timestamptz;
