-- Campus Memories: temporary location-aware campus moments (24h default TTL).

create table if not exists public.campus_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  location_key text not null check (char_length(location_key) between 1 and 80),
  location_name text not null check (char_length(location_name) between 1 and 200),
  event_id uuid,
  media_url text check (media_url is null or char_length(media_url) <= 2048),
  media_type text not null default 'text' check (media_type in ('text', 'image', 'video')),
  body text check (body is null or char_length(body) <= 500),
  visibility text not null default 'public' check (visibility in ('public', 'friends', 'campus')),
  expires_at timestamptz not null,
  saved_to_profile boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (media_type in ('image', 'video') and media_url is not null)
    or (media_type = 'text' and body is not null and char_length(trim(body)) > 0)
  )
);

-- Optional FK to campus_events when that table exists.
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'campus_events'
  ) and not exists (
    select 1 from pg_constraint where conname = 'campus_memories_event_id_fkey'
  ) then
    alter table public.campus_memories
      add constraint campus_memories_event_id_fkey
      foreign key (event_id) references public.campus_events(id) on delete set null;
  end if;
end $$;

create index if not exists idx_campus_memories_user_created
  on public.campus_memories (user_id, created_at desc);

create index if not exists idx_campus_memories_location_active
  on public.campus_memories (location_key, expires_at desc);

create index if not exists idx_campus_memories_expires
  on public.campus_memories (expires_at);

create index if not exists idx_campus_memories_created
  on public.campus_memories (created_at desc);

create index if not exists idx_campus_memories_location_key
  on public.campus_memories (location_key);

create index if not exists idx_campus_memories_saved_profile
  on public.campus_memories (user_id, saved_to_profile, created_at desc)
  where saved_to_profile = true;

drop trigger if exists trg_campus_memories_updated_at on public.campus_memories;
create trigger trg_campus_memories_updated_at
before update on public.campus_memories
for each row execute function public.set_updated_at();

alter table public.campus_memories enable row level security;

drop policy if exists "Authenticated users read campus memories" on public.campus_memories;
create policy "Authenticated users read campus memories"
  on public.campus_memories for select
  to authenticated
  using (
    auth.uid() is not null
    and (
      user_id = auth.uid()
      or visibility in ('public', 'campus')
    )
  );

drop policy if exists "Users insert own campus memories" on public.campus_memories;
create policy "Users insert own campus memories"
  on public.campus_memories for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users update own campus memories" on public.campus_memories;
create policy "Users update own campus memories"
  on public.campus_memories for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users delete own campus memories" on public.campus_memories;
create policy "Users delete own campus memories"
  on public.campus_memories for delete
  to authenticated
  using (auth.uid() = user_id);

comment on table public.campus_memories is 'Temporary campus moments tied to location; default 24h visibility.';
comment on column public.campus_memories.location_key is 'Campus preset key (quad, library, memorial_union, etc.).';
comment on column public.campus_memories.saved_to_profile is 'When true, memory may appear on profile after live expiration.';
