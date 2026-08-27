-- Multi-source campus events: URInvolved remains one provider among several.
-- Additive only. Does not drop campus_events / event_rsvps / existing URInvolved rows.

-- 1. Composite uniqueness so Athletics and URInvolved can share numeric IDs.
alter table public.external_events drop constraint if exists external_events_external_id_key;
alter table public.external_organizations drop constraint if exists external_organizations_external_id_key;
drop index if exists external_events_external_id_key;
drop index if exists external_organizations_external_id_key;

create unique index if not exists external_events_source_external_id_uidx
  on public.external_events (source, external_id);

create unique index if not exists external_organizations_source_external_id_uidx
  on public.external_organizations (source, external_id);

-- 2. Normalized event fields (skip columns that already exist).
alter table public.external_events
  add column if not exists source_type text,
  add column if not exists canonical_event_id uuid references public.external_events(id) on delete set null,
  add column if not exists organization_id uuid references public.external_organizations(id) on delete set null,
  add column if not exists sport text,
  add column if not exists opponent text,
  add column if not exists home_away text,
  add column if not exists score text,
  add column if not exists live_status text,
  add column if not exists ticket_url text,
  add column if not exists broadcast_url text,
  add column if not exists rsvp_url text,
  add column if not exists timezone text not null default 'America/New_York',
  add column if not exists audience text,
  add column if not exists visibility text not null default 'public',
  add column if not exists featured boolean not null default false,
  add column if not exists is_cancelled boolean not null default false,
  add column if not exists cq_rsvp_enabled boolean not null default false,
  add column if not exists last_synced_at timestamptz,
  add column if not exists admin_override boolean not null default false,
  add column if not exists admin_override_fields text[] not null default '{}',
  add column if not exists source_ids jsonb not null default '{}'::jsonb;

create index if not exists idx_external_events_source_type_active
  on public.external_events (source_type, is_active, starts_at asc nulls last);

create index if not exists idx_external_events_canonical
  on public.external_events (canonical_event_id)
  where canonical_event_id is not null;

create index if not exists idx_external_events_sport
  on public.external_events (sport)
  where sport is not null;

-- 3. Organization directory beyond URInvolved clubs.
alter table public.external_organizations
  add column if not exists source_type text,
  add column if not exists organization_type text not null default 'student_club',
  add column if not exists website_url text,
  add column if not exists social_links jsonb not null default '{}'::jsonb,
  add column if not exists contact_email text,
  add column if not exists contact_phone text,
  add column if not exists location_text text,
  add column if not exists verified boolean not null default false;

-- 4. Native CampusQuest events get an explicit source without changing RSVP/QR FKs.
alter table public.campus_events
  add column if not exists source text not null default 'campusquest',
  add column if not exists source_type text not null default 'campusquest';

-- 5. Per-provider sync log extras (existing created/updated columns stay).
alter table public.sync_logs
  add column if not exists events_received integer not null default 0,
  add column if not exists duplicates_merged integer not null default 0,
  add column if not exists error_count integer not null default 0;

-- 6. CampusQuest RSVP for imported events that opt in (Athletics, manual).
create table if not exists public.external_event_rsvps (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.external_events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null check (status in ('going', 'interested', 'not_going')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, user_id)
);

create index if not exists idx_external_event_rsvps_event
  on public.external_event_rsvps (event_id, status);

alter table public.external_event_rsvps enable row level security;

drop policy if exists "external_event_rsvps read" on public.external_event_rsvps;
create policy "external_event_rsvps read"
  on public.external_event_rsvps for select
  to authenticated
  using (true);

drop policy if exists "external_event_rsvps own write" on public.external_event_rsvps;
create policy "external_event_rsvps own write"
  on public.external_event_rsvps for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "external_event_rsvps own update" on public.external_event_rsvps;
create policy "external_event_rsvps own update"
  on public.external_event_rsvps for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 7. Backfill existing URInvolved inventory.
update public.external_events
set
  source_type = coalesce(nullif(source_type, ''), source, 'urinvolved'),
  last_synced_at = coalesce(last_synced_at, last_seen_at, updated_at),
  source_ids = case
    when source_ids = '{}'::jsonb then jsonb_build_object(coalesce(source, 'urinvolved'), external_id)
    else source_ids
  end,
  is_cancelled = case
    when is_cancelled then true
    when exists (
      select 1 from unnest(coalesce(tags, '{}')) as tag
      where tag ~* '^cancell?ed$'
    ) then true
    when title ~* '\(cancell?ed\)' then true
    else is_cancelled
  end
where true;

update public.external_organizations
set
  source_type = coalesce(nullif(source_type, ''), source, 'urinvolved'),
  organization_type = coalesce(nullif(organization_type, ''), 'student_club'),
  website_url = coalesce(website_url, organization_url)
where true;

update public.campus_events
set
  source = coalesce(nullif(source, ''), 'campusquest'),
  source_type = coalesce(nullif(source_type, ''), 'campusquest')
where true;
