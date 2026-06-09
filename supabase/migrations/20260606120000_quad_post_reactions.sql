-- Quad post reactions (like / spark) + one-time spark XP grants

create table if not exists public.quad_post_reactions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.quad_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reaction_type text not null check (reaction_type in ('like', 'spark')),
  created_at timestamptz not null default now(),
  constraint quad_post_reactions_unique unique (post_id, user_id, reaction_type)
);

create index if not exists quad_post_reactions_post_idx
  on public.quad_post_reactions (post_id);

create index if not exists quad_post_reactions_user_idx
  on public.quad_post_reactions (user_id, created_at desc);

-- Tracks spark XP already awarded (survives unspark so users cannot re-farm)
create table if not exists public.quad_spark_xp_grants (
  post_id uuid not null references public.quad_posts(id) on delete cascade,
  sparker_user_id uuid not null references public.profiles(id) on delete cascade,
  granted_at timestamptz not null default now(),
  primary key (post_id, sparker_user_id)
);

-- Keep aggregate counts on quad_posts in sync
create or replace function public.sync_quad_post_reaction_counts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.reaction_type = 'like' then
      update public.quad_posts
      set nod_count = nod_count + 1
      where id = new.post_id;
    elsif new.reaction_type = 'spark' then
      update public.quad_posts
      set hype_count = hype_count + 1
      where id = new.post_id;
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if old.reaction_type = 'like' then
      update public.quad_posts
      set nod_count = greatest(0, nod_count - 1)
      where id = old.post_id;
    elsif old.reaction_type = 'spark' then
      update public.quad_posts
      set hype_count = greatest(0, hype_count - 1)
      where id = old.post_id;
    end if;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_sync_quad_post_reaction_counts on public.quad_post_reactions;
create trigger trg_sync_quad_post_reaction_counts
after insert or delete on public.quad_post_reactions
for each row execute function public.sync_quad_post_reaction_counts();

alter table public.quad_post_reactions enable row level security;
alter table public.quad_spark_xp_grants enable row level security;

-- Reactions: read all (authenticated), write own only
create policy "Authenticated users read quad post reactions"
  on public.quad_post_reactions for select
  using (auth.uid() is not null);

create policy "Users insert own quad post reactions"
  on public.quad_post_reactions for insert
  with check (auth.uid() = user_id);

create policy "Users delete own quad post reactions"
  on public.quad_post_reactions for delete
  using (auth.uid() = user_id);

-- Spark XP grants: server-managed; users can read own grant rows
create policy "Users read own spark xp grants"
  on public.quad_spark_xp_grants for select
  using (auth.uid() = sparker_user_id or auth.uid() in (
    select user_id from public.quad_posts where id = post_id
  ));

-- Extend xp_logs source_type for quad spark rewards
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
    'quad_spark'
  ));
