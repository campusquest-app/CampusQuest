-- Lock down client-writable XP/stats paths; add security audit table.

create table if not exists public.security_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  event_type text not null check (char_length(trim(event_type)) between 1 and 120),
  blocked_fields text[] not null default '{}'::text[],
  request_path text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_security_events_user_created
  on public.security_events (user_id, created_at desc);

create index if not exists idx_security_events_type_created
  on public.security_events (event_type, created_at desc);

alter table public.security_events enable row level security;

-- No client access; service role only (default when RLS enabled with no policies).

-- user_stats: users may read (leaderboards) but not mutate progression columns.
drop policy if exists "users update own stats" on public.user_stats;
drop policy if exists "user_stats update own row" on public.user_stats;

drop policy if exists "users insert own stats" on public.user_stats;
create policy "users insert own stats"
on public.user_stats for insert
to authenticated
with check (
  auth.uid() = user_id
  and coalesce(total_xp, 0) = 0
  and coalesce(level, 1) = 1
  and coalesce(strength, 0) = 0
  and coalesce(stamina, 0) = 0
  and coalesce(knowledge, 0) = 0
  and coalesce(social, 0) = 0
  and coalesce(focus, 0) = 0
  and coalesce(bosses_defeated, 0) = 0
  and coalesce(final_bosses_defeated, 0) = 0
  and coalesce(quests_completed, 0) = 0
);

-- xp_logs: users may read their history; only service role inserts/updates.
drop policy if exists "users can manage own xp logs" on public.xp_logs;
drop policy if exists "xp_logs manage own" on public.xp_logs;

drop policy if exists "users read own xp logs" on public.xp_logs;
create policy "users read own xp logs"
on public.xp_logs for select
to authenticated
using (auth.uid() = user_id);

-- user_activity_events: server writes only (prevent fake activity feed entries).
drop policy if exists "Users insert own activity events" on public.user_activity_events;

-- Extend xp_logs source types for admin adjustments.
alter table public.xp_logs drop constraint if exists xp_logs_source_type_check;
alter table public.xp_logs add constraint xp_logs_source_type_check
  check (source_type in (
    'activity',
    'quest',
    'boss',
    'guild',
    'manual',
    'streak_bonus',
    'bonus',
    'quad_spark',
    'quad_post',
    'campus_memory_star',
    'admin_adjustment'
  ));

-- Extend activity feed for admin XP adjustments.
alter table public.user_activity_events drop constraint if exists user_activity_events_activity_type_check;
alter table public.user_activity_events add constraint user_activity_events_activity_type_check
  check (
    activity_type in (
      'qr_check_in',
      'quest_completed',
      'xp_reward',
      'manual_log',
      'post_created',
      'memory_saved',
      'achievement',
      'admin_xp_adjustment'
    )
  );

-- Prevent authenticated users from changing profiles.role (admin escalation).
create or replace function public.block_profiles_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.jwt()->>'role', '') = 'service_role' then
    return new;
  end if;
  if new.role is distinct from old.role then
    raise exception 'profiles.role cannot be changed by client';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_block_profiles_role_escalation on public.profiles;
create trigger trg_block_profiles_role_escalation
before update of role on public.profiles
for each row
execute function public.block_profiles_role_escalation();
