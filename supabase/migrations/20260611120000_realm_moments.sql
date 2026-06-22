-- Realm Moments: temporary 24h map pins linked to public Quad posts with a campus location.

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'quad_posts'
  ) then
    alter table public.quad_posts
      add column if not exists location_id text,
      add column if not exists location_name text;

    create index if not exists quad_posts_location_idx on public.quad_posts (location_id)
      where location_id is not null;
  end if;
end $$;

create table if not exists public.realm_moments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null unique,
  user_id uuid not null references public.profiles(id) on delete cascade,
  location_id text not null,
  location_name text not null,
  latitude double precision,
  longitude double precision,
  expires_at timestamptz not null,
  visibility text not null default 'public' check (visibility = 'public'),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'quad_posts'
  ) and not exists (
    select 1 from pg_constraint where conname = 'realm_moments_post_id_fkey'
  ) then
    alter table public.realm_moments
      add constraint realm_moments_post_id_fkey
      foreign key (post_id) references public.quad_posts(id) on delete cascade;
  end if;
end $$;

create index if not exists realm_moments_location_expires_idx
  on public.realm_moments (location_id, expires_at desc)
  where is_active = true;

create index if not exists realm_moments_expires_idx
  on public.realm_moments (expires_at)
  where is_active = true;

alter table public.realm_moments enable row level security;

drop policy if exists "Authenticated read active realm moments" on public.realm_moments;
create policy "Authenticated read active realm moments"
  on public.realm_moments for select
  to authenticated
  using (
    is_active = true
    and expires_at > now()
    and visibility = 'public'
  );

drop policy if exists "Users insert own realm moments" on public.realm_moments;
create policy "Users insert own realm moments"
  on public.realm_moments for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users deactivate own realm moments" on public.realm_moments;
create policy "Users deactivate own realm moments"
  on public.realm_moments for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
