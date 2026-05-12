-- Milestone 1: CampusQuest initial schema (backend only)
-- Includes core gameplay + QR quest support.

create extension if not exists pgcrypto;

-- Shared updated_at trigger function
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =========================
-- Core tables
-- =========================

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null check (char_length(username) between 3 and 24),
  display_name text not null check (char_length(display_name) between 1 and 60),
  avatar_url text,
  bio text default '' not null check (char_length(bio) <= 280),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_stats (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  level integer not null default 1 check (level >= 1),
  total_xp bigint not null default 0 check (total_xp >= 0),
  strength integer not null default 0 check (strength >= 0),
  stamina integer not null default 0 check (stamina >= 0),
  knowledge integer not null default 0 check (knowledge >= 0),
  social integer not null default 0 check (social >= 0),
  focus integer not null default 0 check (focus >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text default '' not null,
  stat_key text not null check (stat_key in ('strength', 'stamina', 'knowledge', 'social', 'focus')),
  base_xp integer not null check (base_xp > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.quests (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  description text default '' not null,
  quest_type text not null check (quest_type in ('daily', 'weekly', 'special', 'location')),
  target_activity_id uuid references public.activities(id) on delete set null,
  target_count integer not null default 1 check (target_count > 0),
  xp_reward integer not null check (xp_reward > 0),
  is_repeatable boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_quests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  quest_id uuid not null references public.quests(id) on delete cascade,
  progress_count integer not null default 0 check (progress_count >= 0),
  status text not null default 'active' check (status in ('active', 'completed', 'claimed', 'expired')),
  assigned_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.quest_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  quest_id uuid not null references public.quests(id) on delete cascade,
  user_quest_id uuid references public.user_quests(id) on delete set null,
  xp_awarded integer not null check (xp_awarded > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.xp_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  activity_id uuid references public.activities(id) on delete set null,
  quest_completion_id uuid references public.quest_completions(id) on delete set null,
  source_type text not null check (source_type in ('activity', 'quest', 'bonus', 'guild', 'manual')),
  xp_amount integer not null check (xp_amount <> 0),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.guilds (
  id uuid primary key default gen_random_uuid(),
  name text unique not null check (char_length(name) between 3 and 48),
  description text default '' not null check (char_length(description) <= 400),
  owner_id uuid not null references public.profiles(id) on delete restrict,
  total_xp bigint not null default 0 check (total_xp >= 0),
  member_count integer not null default 1 check (member_count >= 1),
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.guild_members (
  guild_id uuid not null references public.guilds(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'officer', 'member')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (guild_id, user_id)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  title text not null,
  body text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =========================
-- QR quest support
-- =========================

create table if not exists public.quest_locations (
  id uuid primary key default gen_random_uuid(),
  quest_id uuid not null references public.quests(id) on delete cascade,
  label text not null,
  latitude numeric(9, 6) not null,
  longitude numeric(9, 6) not null,
  qr_token text unique not null,
  radius_meters integer not null default 100 check (radius_meters between 5 and 5000),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.qr_scan_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  quest_location_id uuid not null references public.quest_locations(id) on delete cascade,
  user_quest_id uuid references public.user_quests(id) on delete set null,
  scanned_token text not null,
  status text not null check (status in ('accepted', 'rejected', 'duplicate')),
  scanned_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =========================
-- Basic indexes
-- =========================

create index if not exists idx_profiles_username on public.profiles(username);
create index if not exists idx_user_quests_user_status on public.user_quests(user_id, status);
create index if not exists idx_quest_completions_user_created on public.quest_completions(user_id, created_at desc);
create index if not exists idx_xp_logs_user_created on public.xp_logs(user_id, created_at desc);
create index if not exists idx_guild_members_user on public.guild_members(user_id);
create index if not exists idx_notifications_user_read_created on public.notifications(user_id, is_read, created_at desc);
create index if not exists idx_quest_locations_quest on public.quest_locations(quest_id);
create index if not exists idx_qr_scan_logs_user_scanned on public.qr_scan_logs(user_id, scanned_at desc);

-- =========================
-- updated_at triggers
-- =========================

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists trg_user_stats_updated_at on public.user_stats;
create trigger trg_user_stats_updated_at
before update on public.user_stats
for each row execute function public.set_updated_at();

drop trigger if exists trg_activities_updated_at on public.activities;
create trigger trg_activities_updated_at
before update on public.activities
for each row execute function public.set_updated_at();

drop trigger if exists trg_quests_updated_at on public.quests;
create trigger trg_quests_updated_at
before update on public.quests
for each row execute function public.set_updated_at();

drop trigger if exists trg_user_quests_updated_at on public.user_quests;
create trigger trg_user_quests_updated_at
before update on public.user_quests
for each row execute function public.set_updated_at();

drop trigger if exists trg_quest_completions_updated_at on public.quest_completions;
create trigger trg_quest_completions_updated_at
before update on public.quest_completions
for each row execute function public.set_updated_at();

drop trigger if exists trg_xp_logs_updated_at on public.xp_logs;
create trigger trg_xp_logs_updated_at
before update on public.xp_logs
for each row execute function public.set_updated_at();

drop trigger if exists trg_guilds_updated_at on public.guilds;
create trigger trg_guilds_updated_at
before update on public.guilds
for each row execute function public.set_updated_at();

drop trigger if exists trg_guild_members_updated_at on public.guild_members;
create trigger trg_guild_members_updated_at
before update on public.guild_members
for each row execute function public.set_updated_at();

drop trigger if exists trg_notifications_updated_at on public.notifications;
create trigger trg_notifications_updated_at
before update on public.notifications
for each row execute function public.set_updated_at();

drop trigger if exists trg_quest_locations_updated_at on public.quest_locations;
create trigger trg_quest_locations_updated_at
before update on public.quest_locations
for each row execute function public.set_updated_at();

drop trigger if exists trg_qr_scan_logs_updated_at on public.qr_scan_logs;
create trigger trg_qr_scan_logs_updated_at
before update on public.qr_scan_logs
for each row execute function public.set_updated_at();

-- =========================
-- Row Level Security
-- =========================

alter table public.profiles enable row level security;
alter table public.user_stats enable row level security;
alter table public.activities enable row level security;
alter table public.quests enable row level security;
alter table public.user_quests enable row level security;
alter table public.quest_completions enable row level security;
alter table public.xp_logs enable row level security;
alter table public.guilds enable row level security;
alter table public.guild_members enable row level security;
alter table public.notifications enable row level security;
alter table public.quest_locations enable row level security;
alter table public.qr_scan_logs enable row level security;

-- profiles
create policy "profiles select authenticated"
on public.profiles for select
to authenticated
using (true);

create policy "profiles insert own row"
on public.profiles for insert
to authenticated
with check (auth.uid() = id);

create policy "profiles update own row"
on public.profiles for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

-- user_stats
create policy "user_stats select authenticated"
on public.user_stats for select
to authenticated
using (true);

create policy "user_stats insert own row"
on public.user_stats for insert
to authenticated
with check (auth.uid() = user_id);

create policy "user_stats update own row"
on public.user_stats for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- activities + quests + quest_locations are readable catalogs
create policy "activities read active"
on public.activities for select
to authenticated
using (is_active = true);

create policy "quests read active"
on public.quests for select
to authenticated
using (is_active = true);

create policy "quest_locations read active"
on public.quest_locations for select
to authenticated
using (is_active = true);

-- user_quests
create policy "user_quests manage own"
on public.user_quests for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- quest_completions
create policy "quest_completions read authenticated"
on public.quest_completions for select
to authenticated
using (true);

create policy "quest_completions insert own"
on public.quest_completions for insert
to authenticated
with check (auth.uid() = user_id);

-- xp_logs
create policy "xp_logs manage own"
on public.xp_logs for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- guilds + members
create policy "guilds read public"
on public.guilds for select
to authenticated
using (is_public = true);

create policy "guilds create owner"
on public.guilds for insert
to authenticated
with check (auth.uid() = owner_id);

create policy "guilds owner update"
on public.guilds for update
to authenticated
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

create policy "guild_members read authenticated"
on public.guild_members for select
to authenticated
using (true);

create policy "guild_members insert self"
on public.guild_members for insert
to authenticated
with check (auth.uid() = user_id);

create policy "guild_members delete self"
on public.guild_members for delete
to authenticated
using (auth.uid() = user_id);

-- notifications
create policy "notifications read own"
on public.notifications for select
to authenticated
using (auth.uid() = user_id);

create policy "notifications update own"
on public.notifications for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- qr_scan_logs
create policy "qr_scan_logs read own"
on public.qr_scan_logs for select
to authenticated
using (auth.uid() = user_id);

create policy "qr_scan_logs insert own"
on public.qr_scan_logs for insert
to authenticated
with check (auth.uid() = user_id);

