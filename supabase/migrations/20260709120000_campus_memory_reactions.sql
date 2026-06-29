-- Campus Memory reactions: stars (one-time XP spotlight) and likes.

create table if not exists public.campus_memory_stars (
  id uuid primary key default gen_random_uuid(),
  memory_id uuid not null references public.campus_memories (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint campus_memory_stars_memory_user_unique unique (memory_id, user_id)
);

create table if not exists public.campus_memory_likes (
  id uuid primary key default gen_random_uuid(),
  memory_id uuid not null references public.campus_memories (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint campus_memory_likes_memory_user_unique unique (memory_id, user_id)
);

create index if not exists idx_campus_memory_stars_memory_id on public.campus_memory_stars (memory_id);
create index if not exists idx_campus_memory_stars_user_id on public.campus_memory_stars (user_id);
create index if not exists idx_campus_memory_likes_memory_id on public.campus_memory_likes (memory_id);
create index if not exists idx_campus_memory_likes_user_id on public.campus_memory_likes (user_id);

alter table public.campus_memory_stars enable row level security;
alter table public.campus_memory_likes enable row level security;

-- Stars: authenticated users can read all (for counts); insert own row only.
create policy "campus_memory_stars_select"
on public.campus_memory_stars for select
to authenticated
using (true);

create policy "campus_memory_stars_insert_own"
on public.campus_memory_stars for insert
to authenticated
with check (auth.uid() = user_id);

-- Likes: read all; insert/delete own rows.
create policy "campus_memory_likes_select"
on public.campus_memory_likes for select
to authenticated
using (true);

create policy "campus_memory_likes_insert_own"
on public.campus_memory_likes for insert
to authenticated
with check (auth.uid() = user_id);

create policy "campus_memory_likes_delete_own"
on public.campus_memory_likes for delete
to authenticated
using (auth.uid() = user_id);
