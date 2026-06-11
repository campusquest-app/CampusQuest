-- URInvolved external sync tables (additive — does not modify campus_events / student_organizations)

create table if not exists public.external_events (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'urinvolved',
  external_id text not null unique,
  title text not null,
  description text,
  organization_name text,
  location_name text,
  starts_at timestamptz,
  ends_at timestamptz,
  image_url text,
  event_url text,
  category text,
  tags text[] not null default '{}',
  latitude double precision,
  longitude double precision,
  is_active boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_external_events_active_starts
  on public.external_events (is_active, starts_at asc nulls last);

create index if not exists idx_external_events_source_active
  on public.external_events (source, is_active, last_seen_at desc);

create table if not exists public.external_organizations (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'urinvolved',
  external_id text not null unique,
  name text not null,
  description text,
  logo_url text,
  organization_url text,
  category text,
  tags text[] not null default '{}',
  is_active boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_external_organizations_source_active
  on public.external_organizations (source, is_active, name asc);

create table if not exists public.sync_logs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  sync_type text not null,
  status text not null check (status in ('running', 'success', 'failed')),
  events_created integer not null default 0,
  events_updated integer not null default 0,
  orgs_created integer not null default 0,
  orgs_updated integer not null default 0,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists idx_sync_logs_source_started
  on public.sync_logs (source, started_at desc);

alter table public.external_events enable row level security;
alter table public.external_organizations enable row level security;
alter table public.sync_logs enable row level security;

-- Students may read active imported rows only (writes via service role on server).
create policy "external_events read active"
  on public.external_events for select
  to authenticated, anon
  using (is_active = true);

create policy "external_organizations read active"
  on public.external_organizations for select
  to authenticated, anon
  using (is_active = true);

-- Sync logs: platform admins only.
create policy "sync_logs read admin"
  on public.sync_logs for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin', 'super_admin')
    )
  );
