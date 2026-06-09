-- boss_drops: permanent per-user boss loot (idempotent)

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

create index if not exists boss_drops_user_id_idx
  on public.boss_drops (user_id);

create index if not exists boss_drops_boss_id_idx
  on public.boss_drops (boss_id);

create unique index if not exists boss_drops_unique_drop_idx
  on public.boss_drops (user_id, boss_id, item_id);

alter table public.boss_drops enable row level security;

drop policy if exists "Users read own boss drops" on public.boss_drops;
create policy "Users read own boss drops"
  on public.boss_drops for select
  using (auth.uid() = user_id);

drop policy if exists "Users insert own boss drops" on public.boss_drops;
create policy "Users insert own boss drops"
  on public.boss_drops for insert
  with check (auth.uid() = user_id);
