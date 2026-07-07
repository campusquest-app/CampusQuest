-- Profile activity feed events (QR check-ins, quest completions, XP rewards, etc.)

create table if not exists public.user_activity_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  activity_type text not null check (
    activity_type in (
      'qr_check_in',
      'quest_completed',
      'xp_reward',
      'manual_log',
      'post_created',
      'memory_saved',
      'achievement'
    )
  ),
  title text not null check (char_length(trim(title)) between 1 and 200),
  description text check (description is null or char_length(description) <= 500),
  xp_awarded integer not null default 0 check (xp_awarded >= 0),
  quest_id uuid,
  location_id uuid references public.campus_locations(id) on delete set null,
  qr_code_id uuid references public.qr_codes(id) on delete set null,
  post_id uuid,
  memory_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_user_activity_events_user_created
  on public.user_activity_events (user_id, created_at desc);

create index if not exists idx_user_activity_events_qr_recent
  on public.user_activity_events (user_id, qr_code_id, created_at desc)
  where qr_code_id is not null;

create index if not exists idx_user_activity_events_quest_recent
  on public.user_activity_events (user_id, quest_id, created_at desc)
  where quest_id is not null;

alter table public.user_activity_events enable row level security;

drop policy if exists "Users read own activity events" on public.user_activity_events;
create policy "Users read own activity events"
  on public.user_activity_events for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users insert own activity events" on public.user_activity_events;
create policy "Users insert own activity events"
  on public.user_activity_events for insert
  to authenticated
  with check (user_id = auth.uid());
