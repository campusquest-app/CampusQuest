-- CampusQuest MVP backend schema
-- Supabase Postgres + Auth + Storage

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.calculate_level(total_xp bigint)
returns integer
language sql
immutable
as $$
  select greatest(1, floor(sqrt(greatest(total_xp, 0)::numeric / 120))::int + 1);
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null check (char_length(username) between 3 and 24),
  display_name text not null check (char_length(display_name) between 1 and 50),
  avatar_url text,
  bio text default '' not null check (char_length(bio) <= 280),
  campus text,
  class_year integer check (class_year between 1900 and 3000),
  guild_id uuid,
  streak_days integer default 0 not null check (streak_days >= 0),
  last_activity_date date,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create table if not exists public.user_stats (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  level integer default 1 not null check (level >= 1),
  total_xp bigint default 0 not null check (total_xp >= 0),
  strength integer default 0 not null check (strength >= 0),
  stamina integer default 0 not null check (stamina >= 0),
  knowledge integer default 0 not null check (knowledge >= 0),
  social integer default 0 not null check (social >= 0),
  focus integer default 0 not null check (focus >= 0),
  bosses_defeated integer default 0 not null check (bosses_defeated >= 0),
  quests_completed integer default 0 not null check (quests_completed >= 0),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text default '' not null,
  stat_key text not null check (stat_key in ('strength', 'stamina', 'knowledge', 'social', 'focus')),
  base_xp integer not null check (base_xp > 0),
  is_active boolean default true not null,
  created_at timestamptz default now() not null
);

create table if not exists public.xp_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  activity_id uuid references public.activities(id) on delete set null,
  source_type text not null check (
    source_type in ('activity', 'quest', 'boss', 'guild', 'manual', 'streak_bonus')
  ),
  source_id uuid,
  xp_amount integer not null check (xp_amount <> 0),
  note text,
  created_at timestamptz default now() not null
);

create table if not exists public.quests (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  description text default '' not null,
  quest_type text not null check (quest_type in ('daily', 'weekly', 'special')),
  target_activity_id uuid references public.activities(id) on delete set null,
  target_count integer default 1 not null check (target_count > 0),
  xp_reward integer not null check (xp_reward > 0),
  is_repeatable boolean default true not null,
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean default true not null,
  created_at timestamptz default now() not null
);

create table if not exists public.user_quests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  quest_id uuid not null references public.quests(id) on delete cascade,
  progress_count integer default 0 not null check (progress_count >= 0),
  status text default 'active' not null check (status in ('active', 'completed', 'claimed', 'expired')),
  assigned_at timestamptz default now() not null,
  completed_at timestamptz,
  unique (user_id, quest_id, assigned_at)
);

create table if not exists public.quest_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  quest_id uuid not null references public.quests(id) on delete cascade,
  user_quest_id uuid references public.user_quests(id) on delete set null,
  xp_awarded integer not null check (xp_awarded > 0),
  created_at timestamptz default now() not null
);

create table if not exists public.proof_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  activity_log_id uuid references public.xp_logs(id) on delete set null,
  quest_completion_id uuid references public.quest_completions(id) on delete set null,
  storage_path text not null,
  public_url text,
  status text default 'pending' not null check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz default now() not null
);

create table if not exists public.guilds (
  id uuid primary key default gen_random_uuid(),
  name text unique not null check (char_length(name) between 3 and 48),
  description text default '' not null check (char_length(description) <= 400),
  logo_url text,
  owner_id uuid not null references public.profiles(id) on delete restrict,
  total_xp bigint default 0 not null check (total_xp >= 0),
  member_count integer default 1 not null check (member_count >= 1),
  is_public boolean default true not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table public.profiles
  add constraint profiles_guild_id_fkey
  foreign key (guild_id) references public.guilds(id) on delete set null;

create table if not exists public.guild_members (
  guild_id uuid not null references public.guilds(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text default 'member' not null check (role in ('owner', 'officer', 'member')),
  joined_at timestamptz default now() not null,
  primary key (guild_id, user_id)
);

create table if not exists public.guild_xp_logs (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.guilds(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  source_type text not null check (source_type in ('activity', 'quest', 'boss', 'event')),
  source_id uuid,
  xp_amount integer not null check (xp_amount <> 0),
  created_at timestamptz default now() not null
);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  image_url text,
  likes_count integer default 0 not null check (likes_count >= 0),
  comments_count integer default 0 not null check (comments_count >= 0),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 300),
  created_at timestamptz default now() not null
);

create table if not exists public.likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz default now() not null,
  primary key (post_id, user_id)
);

create table if not exists public.bosses (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text default '' not null,
  max_hp integer not null check (max_hp > 0),
  xp_reward integer not null check (xp_reward > 0),
  min_level integer default 1 not null check (min_level >= 1),
  is_active boolean default true not null,
  created_at timestamptz default now() not null
);

create table if not exists public.boss_attempts (
  id uuid primary key default gen_random_uuid(),
  boss_id uuid not null references public.bosses(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  activity_id uuid references public.activities(id) on delete set null,
  damage integer not null check (damage > 0),
  was_killing_blow boolean default false not null,
  created_at timestamptz default now() not null
);

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text default '' not null,
  item_type text not null check (item_type in ('consumable', 'equipment', 'cosmetic', 'material')),
  rarity text not null check (rarity in ('common', 'uncommon', 'rare', 'epic', 'legendary')),
  icon_url text,
  metadata jsonb default '{}'::jsonb not null,
  is_active boolean default true not null,
  created_at timestamptz default now() not null
);

create table if not exists public.user_inventory (
  user_id uuid not null references public.profiles(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete cascade,
  quantity integer default 1 not null check (quantity > 0),
  acquired_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  primary key (user_id, item_id)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  title text not null,
  body text not null,
  metadata jsonb default '{}'::jsonb not null,
  is_read boolean default false not null,
  created_at timestamptz default now() not null
);

create index if not exists idx_profiles_username on public.profiles(username);
create index if not exists idx_profiles_guild_id on public.profiles(guild_id);
create index if not exists idx_xp_logs_user_created on public.xp_logs(user_id, created_at desc);
create index if not exists idx_user_quests_user_status on public.user_quests(user_id, status);
create index if not exists idx_quest_completions_user_created on public.quest_completions(user_id, created_at desc);
create index if not exists idx_proof_submissions_user_created on public.proof_submissions(user_id, created_at desc);
create index if not exists idx_guild_members_user on public.guild_members(user_id);
create index if not exists idx_guild_xp_logs_guild_created on public.guild_xp_logs(guild_id, created_at desc);
create index if not exists idx_posts_created on public.posts(created_at desc);
create index if not exists idx_comments_post_created on public.comments(post_id, created_at asc);
create index if not exists idx_boss_attempts_boss_created on public.boss_attempts(boss_id, created_at desc);
create index if not exists idx_boss_attempts_user_created on public.boss_attempts(user_id, created_at desc);
create index if not exists idx_notifications_user_read_created on public.notifications(user_id, is_read, created_at desc);

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists trg_user_stats_updated_at on public.user_stats;
create trigger trg_user_stats_updated_at
before update on public.user_stats
for each row execute function public.set_updated_at();

drop trigger if exists trg_guilds_updated_at on public.guilds;
create trigger trg_guilds_updated_at
before update on public.guilds
for each row execute function public.set_updated_at();

drop trigger if exists trg_posts_updated_at on public.posts;
create trigger trg_posts_updated_at
before update on public.posts
for each row execute function public.set_updated_at();

drop trigger if exists trg_user_inventory_updated_at on public.user_inventory;
create trigger trg_user_inventory_updated_at
before update on public.user_inventory
for each row execute function public.set_updated_at();

-- RLS setup
alter table public.profiles enable row level security;
alter table public.user_stats enable row level security;
alter table public.activities enable row level security;
alter table public.xp_logs enable row level security;
alter table public.quests enable row level security;
alter table public.user_quests enable row level security;
alter table public.quest_completions enable row level security;
alter table public.proof_submissions enable row level security;
alter table public.guilds enable row level security;
alter table public.guild_members enable row level security;
alter table public.guild_xp_logs enable row level security;
alter table public.posts enable row level security;
alter table public.comments enable row level security;
alter table public.likes enable row level security;
alter table public.bosses enable row level security;
alter table public.boss_attempts enable row level security;
alter table public.items enable row level security;
alter table public.user_inventory enable row level security;
alter table public.notifications enable row level security;

-- Profiles and stats
create policy "profiles are viewable by authenticated users"
on public.profiles for select
to authenticated
using (true);

create policy "users insert own profile"
on public.profiles for insert
to authenticated
with check (auth.uid() = id);

create policy "users update own profile"
on public.profiles for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "user_stats viewable for leaderboards"
on public.user_stats for select
to authenticated
using (true);

create policy "users insert own stats"
on public.user_stats for insert
to authenticated
with check (auth.uid() = user_id);

create policy "users update own stats"
on public.user_stats for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Gameplay catalogs
create policy "activities are readable by authenticated users"
on public.activities for select
to authenticated
using (is_active = true);

create policy "quests are readable by authenticated users"
on public.quests for select
to authenticated
using (is_active = true and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at >= now()));

create policy "bosses are readable by authenticated users"
on public.bosses for select
to authenticated
using (is_active = true);

create policy "items are readable by authenticated users"
on public.items for select
to authenticated
using (is_active = true);

-- User-owned gameplay data
create policy "users can manage own xp logs"
on public.xp_logs for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "users can manage own user quests"
on public.user_quests for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "quest completions viewable for public achievements"
on public.quest_completions for select
to authenticated
using (true);

create policy "users can insert own quest completions"
on public.quest_completions for insert
to authenticated
with check (auth.uid() = user_id);

create policy "users can view own proof submissions"
on public.proof_submissions for select
to authenticated
using (auth.uid() = user_id);

create policy "users can insert own proof submissions"
on public.proof_submissions for insert
to authenticated
with check (auth.uid() = user_id);

create policy "users can update own pending proofs"
on public.proof_submissions for update
to authenticated
using (auth.uid() = user_id and status = 'pending')
with check (auth.uid() = user_id);

-- Guild social graph and leaderboards
create policy "guilds are publicly readable"
on public.guilds for select
to authenticated
using (is_public = true);

create policy "users can create guilds they own"
on public.guilds for insert
to authenticated
with check (auth.uid() = owner_id);

create policy "guild owners can update guilds"
on public.guilds for update
to authenticated
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

create policy "guild members are publicly readable"
on public.guild_members for select
to authenticated
using (true);

create policy "users can join guilds as themselves"
on public.guild_members for insert
to authenticated
with check (auth.uid() = user_id);

create policy "users can leave their own guild membership"
on public.guild_members for delete
to authenticated
using (auth.uid() = user_id);

create policy "guild xp logs are readable for leaderboards"
on public.guild_xp_logs for select
to authenticated
using (true);

create policy "members can add guild xp logs"
on public.guild_xp_logs for insert
to authenticated
with check (
  exists (
    select 1 from public.guild_members gm
    where gm.guild_id = guild_xp_logs.guild_id
      and gm.user_id = auth.uid()
  )
);

-- Social feed
create policy "posts are publicly readable"
on public.posts for select
to authenticated
using (true);

create policy "users can create own posts"
on public.posts for insert
to authenticated
with check (auth.uid() = user_id);

create policy "users can update own posts"
on public.posts for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "users can delete own posts"
on public.posts for delete
to authenticated
using (auth.uid() = user_id);

create policy "comments are publicly readable"
on public.comments for select
to authenticated
using (true);

create policy "users can manage own comments"
on public.comments for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "likes are publicly readable"
on public.likes for select
to authenticated
using (true);

create policy "users can manage own likes"
on public.likes for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Bosses and inventory
create policy "users can view own boss attempts"
on public.boss_attempts for select
to authenticated
using (auth.uid() = user_id);

create policy "users can insert own boss attempts"
on public.boss_attempts for insert
to authenticated
with check (auth.uid() = user_id);

create policy "users can view own inventory"
on public.user_inventory for select
to authenticated
using (auth.uid() = user_id);

create policy "users can insert own inventory items"
on public.user_inventory for insert
to authenticated
with check (auth.uid() = user_id);

create policy "users can update own inventory items"
on public.user_inventory for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "users can delete own inventory items"
on public.user_inventory for delete
to authenticated
using (auth.uid() = user_id);

-- Notifications
create policy "users can view own notifications"
on public.notifications for select
to authenticated
using (auth.uid() = user_id);

create policy "users can update own notifications"
on public.notifications for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Storage bucket for proof image uploads
insert into storage.buckets (id, name, public)
values ('proof-images', 'proof-images', false)
on conflict (id) do nothing;

create policy "users can upload own proof images"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'proof-images'
  and name like auth.uid()::text || '/%'
);

create policy "users can read own proof images"
on storage.objects for select
to authenticated
using (
  bucket_id = 'proof-images'
  and name like auth.uid()::text || '/%'
);

