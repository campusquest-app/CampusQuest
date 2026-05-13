-- Equipment loadout (authoritative for hat / glasses / backpack + flexible extra JSON)
-- Quad posts (persist user posts; source of truth in Supabase)

-- -------------------------
-- user_equipment_loadouts
-- -------------------------

create table if not exists public.user_equipment_loadouts (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  hat_id text,
  glasses_id text,
  backpack_id text,
  extra_slots jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists user_equipment_loadouts_updated_at_idx
  on public.user_equipment_loadouts (updated_at desc);

drop trigger if exists user_equipment_loadouts_set_updated_at on public.user_equipment_loadouts;
create trigger user_equipment_loadouts_set_updated_at
  before update on public.user_equipment_loadouts
  for each row execute function public.set_updated_at();

alter table public.user_equipment_loadouts enable row level security;

create policy "Users select own equipment loadout"
  on public.user_equipment_loadouts for select
  using (auth.uid() = user_id);

create policy "Users insert own equipment loadout"
  on public.user_equipment_loadouts for insert
  with check (auth.uid() = user_id);

create policy "Users update own equipment loadout"
  on public.user_equipment_loadouts for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users delete own equipment loadout"
  on public.user_equipment_loadouts for delete
  using (auth.uid() = user_id);

-- -------------------------
-- quad_posts
-- -------------------------

create table if not exists public.quad_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) >= 1 and char_length(body) <= 300),
  proof_url text,
  visibility text not null default 'public' check (visibility in ('public', 'friends')),
  ram_marks jsonb not null default '[]'::jsonb,
  related_activity_id text,
  related_quest_slug text,
  author_streak_days integer,
  nod_count integer not null default 0 check (nod_count >= 0),
  hype_count integer not null default 0 check (hype_count >= 0),
  verify_count integer not null default 0 check (verify_count >= 0),
  assist_count integer not null default 0 check (assist_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists quad_posts_user_created_idx
  on public.quad_posts (user_id, created_at desc);

create index if not exists quad_posts_visibility_created_idx
  on public.quad_posts (visibility, created_at desc);

drop trigger if exists quad_posts_set_updated_at on public.quad_posts;
create trigger quad_posts_set_updated_at
  before update on public.quad_posts
  for each row execute function public.set_updated_at();

alter table public.quad_posts enable row level security;

-- Authenticated users can read posts for Quad feed (app filters friends vs public in API layer for tighter privacy later).
create policy "Authenticated users read quad posts"
  on public.quad_posts for select
  using (auth.uid() is not null);

create policy "Users insert own quad posts"
  on public.quad_posts for insert
  with check (auth.uid() = user_id);

create policy "Users update own quad posts"
  on public.quad_posts for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users delete own quad posts"
  on public.quad_posts for delete
  using (auth.uid() = user_id);
