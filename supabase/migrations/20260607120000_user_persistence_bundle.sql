-- Permanent persistence for post likes, boss drops, and inventory sources.

-- ---------------------------------------------------------------------------
-- post_likes (canonical Quad like storage)
-- ---------------------------------------------------------------------------
create table if not exists public.post_likes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.quad_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint post_likes_unique unique (post_id, user_id)
);

create index if not exists post_likes_post_idx on public.post_likes (post_id);
create index if not exists post_likes_user_idx on public.post_likes (user_id, created_at desc);

-- Keep nod_count in sync from post_likes (must exist before backfill disable/enable)
create or replace function public.sync_quad_post_like_counts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.quad_posts
    set nod_count = nod_count + 1
    where id = new.post_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.quad_posts
    set nod_count = greatest(0, nod_count - 1)
    where id = old.post_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_sync_quad_post_like_counts on public.post_likes;
create trigger trg_sync_quad_post_like_counts
after insert or delete on public.post_likes
for each row execute function public.sync_quad_post_like_counts();

-- Backfill from legacy quad_post_reactions (like only) without double-counting nod_count
alter table public.post_likes disable trigger trg_sync_quad_post_like_counts;
insert into public.post_likes (post_id, user_id, created_at)
select post_id, user_id, created_at
from public.quad_post_reactions
where reaction_type = 'like'
on conflict (post_id, user_id) do nothing;
alter table public.post_likes enable trigger trg_sync_quad_post_like_counts;

-- Likes now live in post_likes; remove legacy like rows from quad_post_reactions
delete from public.quad_post_reactions where reaction_type = 'like';

-- Spark-only sync on quad_post_reactions (likes handled by post_likes)
create or replace function public.sync_quad_post_reaction_counts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.reaction_type = 'spark' then
      update public.quad_posts
      set hype_count = hype_count + 1
      where id = new.post_id;
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if old.reaction_type = 'spark' then
      update public.quad_posts
      set hype_count = greatest(0, hype_count - 1)
      where id = old.post_id;
    end if;
    return old;
  end if;
  return null;
end;
$$;

alter table public.post_likes enable row level security;

create policy "Authenticated users read post likes"
  on public.post_likes for select
  using (auth.uid() is not null);

create policy "Users insert own post likes"
  on public.post_likes for insert
  with check (auth.uid() = user_id);

create policy "Users delete own post likes"
  on public.post_likes for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- boss_drops (per-user collectible drops from personal/catalog bosses)
-- See also: 20260608120000_boss_drops.sql (canonical standalone migration)
-- ---------------------------------------------------------------------------
create table if not exists public.boss_drops (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  boss_id text not null,
  item_id text not null,
  item_name text,
  quantity integer not null default 1,
  rarity text,
  earned_at timestamptz not null default now()
);

create index if not exists boss_drops_user_id_idx on public.boss_drops (user_id);
create index if not exists boss_drops_boss_id_idx on public.boss_drops (boss_id);
create unique index if not exists boss_drops_unique_drop_idx on public.boss_drops (user_id, boss_id, item_id);

alter table public.boss_drops enable row level security;

drop policy if exists "Users read own boss drops" on public.boss_drops;
create policy "Users read own boss drops"
  on public.boss_drops for select
  using (auth.uid() = user_id);

drop policy if exists "Users insert own boss drops" on public.boss_drops;
create policy "Users insert own boss drops"
  on public.boss_drops for insert
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- user_inventory: track acquisition source
-- ---------------------------------------------------------------------------
alter table public.user_inventory
  add column if not exists source text not null default 'unknown';
