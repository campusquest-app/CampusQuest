-- Permanent invariant: UNIQUE (source, external_id) on external_events / external_organizations.
-- Forward-only repair (does not edit historical migrations).
--
-- Dedupe strategy for events (preserve best/current):
--   1) Prefer admin_override = true
--   2) Prefer is_active = true
--   3) Prefer newest last_seen_at / updated_at / created_at
--   4) Prefer lowest id as final tie-break
-- Before deleting losers: re-point external_event_rsvps and map overrides to the keeper
-- when no conflicting row already exists; otherwise CASCADE on delete is acceptable.
--
-- Also reloads PostgREST schema cache so ON CONFLICT targets are visible to the API.

-- ---------------------------------------------------------------------------
-- 0) Column nullability (imported + manual events always set both)
-- ---------------------------------------------------------------------------
alter table public.external_events
  alter column source set not null,
  alter column external_id set not null;

alter table public.external_organizations
  alter column source set not null,
  alter column external_id set not null;

-- ---------------------------------------------------------------------------
-- 1) Deduplicate organizations (keep earliest created_at, then lowest id)
-- ---------------------------------------------------------------------------
with ranked as (
  select
    id,
    row_number() over (
      partition by source, external_id
      order by created_at asc nulls last, id asc
    ) as rn
  from public.external_organizations
),
losers as (
  select id from ranked where rn > 1
)
update public.external_events e
set organization_id = null
where e.organization_id in (select id from losers);

with ranked as (
  select
    id,
    row_number() over (
      partition by source, external_id
      order by created_at asc nulls last, id asc
    ) as rn
  from public.external_organizations
)
delete from public.external_organizations eo
using ranked r
where eo.id = r.id
  and r.rn > 1;

-- ---------------------------------------------------------------------------
-- 2) Deduplicate events — reassign dependents, then delete losers
-- ---------------------------------------------------------------------------
create temporary table _ext_event_dupes on commit drop as
with ranked as (
  select
    id,
    source,
    external_id,
    row_number() over (
      partition by source, external_id
      order by
        case when coalesce(admin_override, false) then 0 else 1 end,
        case when coalesce(is_active, false) then 0 else 1 end,
        last_seen_at desc nulls last,
        updated_at desc nulls last,
        created_at desc nulls last,
        id asc
    ) as rn
  from public.external_events
)
select
  r.id as loser_id,
  k.id as keeper_id
from ranked r
join ranked k
  on k.source = r.source
 and k.external_id = r.external_id
 and k.rn = 1
where r.rn > 1;

-- Re-point RSVPs to keeper when the (event_id, user_id) pair is free.
update public.external_event_rsvps rsvp
set event_id = d.keeper_id
from _ext_event_dupes d
where rsvp.event_id = d.loser_id
  and not exists (
    select 1
    from public.external_event_rsvps other
    where other.event_id = d.keeper_id
      and other.user_id = rsvp.user_id
  );

delete from public.external_event_rsvps rsvp
using _ext_event_dupes d
where rsvp.event_id = d.loser_id;

-- Re-point map overrides when keeper has none.
update public.external_event_map_overrides ov
set external_event_id = d.keeper_id
from _ext_event_dupes d
where ov.external_event_id = d.loser_id
  and not exists (
    select 1
    from public.external_event_map_overrides other
    where other.external_event_id = d.keeper_id
  );

delete from public.external_event_map_overrides ov
using _ext_event_dupes d
where ov.external_event_id = d.loser_id;

-- Clear self-references pointing at losers.
update public.external_events e
set canonical_event_id = null
from _ext_event_dupes d
where e.canonical_event_id = d.loser_id;

delete from public.external_events e
using _ext_event_dupes d
where e.id = d.loser_id;

-- ---------------------------------------------------------------------------
-- 3) Drop legacy single-column uniqueness
-- ---------------------------------------------------------------------------
alter table public.external_events drop constraint if exists external_events_external_id_key;
alter table public.external_organizations drop constraint if exists external_organizations_external_id_key;
drop index if exists public.external_events_external_id_key;
drop index if exists public.external_organizations_external_id_key;

-- ---------------------------------------------------------------------------
-- 4) Ensure named UNIQUE(source, external_id) — no redundant second unique index
--
-- Production may already have:
--   • constraint external_events_source_external_id_key (owns its own index), AND
--   • a free-standing external_events_source_external_id_uidx on the same columns.
-- Prefer the named constraint; drop the free-standing uidx when the constraint exists.
-- Only create/bind the uidx when the named constraint is still missing.
-- ---------------------------------------------------------------------------
do $$
declare
  has_events_constraint boolean;
  has_orgs_constraint boolean;
  has_events_uidx boolean;
  has_orgs_uidx boolean;
begin
  select exists (
    select 1 from pg_constraint
    where conname = 'external_events_source_external_id_key'
      and conrelid = 'public.external_events'::regclass
  ) into has_events_constraint;

  select exists (
    select 1 from pg_constraint
    where conname = 'external_organizations_source_external_id_key'
      and conrelid = 'public.external_organizations'::regclass
  ) into has_orgs_constraint;

  select exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'external_events_source_external_id_uidx'
      and c.relkind = 'i'
  ) into has_events_uidx;

  select exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'external_organizations_source_external_id_uidx'
      and c.relkind = 'i'
  ) into has_orgs_uidx;

  -- Drop redundant free-standing uidx when the named constraint already enforces uniqueness.
  if has_events_constraint and has_events_uidx then
    if exists (
      select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = 'external_events_source_external_id_uidx'
        and c.relkind = 'i'
        and not exists (select 1 from pg_constraint con where con.conindid = c.oid)
    ) then
      execute 'drop index public.external_events_source_external_id_uidx';
      has_events_uidx := false;
    end if;
  end if;

  if has_orgs_constraint and has_orgs_uidx then
    if exists (
      select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = 'external_organizations_source_external_id_uidx'
        and c.relkind = 'i'
        and not exists (select 1 from pg_constraint con where con.conindid = c.oid)
    ) then
      execute 'drop index public.external_organizations_source_external_id_uidx';
      has_orgs_uidx := false;
    end if;
  end if;

  if not has_events_constraint then
    if not has_events_uidx then
      execute 'create unique index external_events_source_external_id_uidx on public.external_events (source, external_id)';
    end if;
    begin
      alter table public.external_events
        add constraint external_events_source_external_id_key
        unique using index external_events_source_external_id_uidx;
    exception
      when duplicate_object then null;
      when invalid_table_definition then
        -- Index already owned by another constraint; add plain unique constraint.
        alter table public.external_events
          add constraint external_events_source_external_id_key unique (source, external_id);
    end;
  end if;

  if not has_orgs_constraint then
    if not has_orgs_uidx then
      execute 'create unique index external_organizations_source_external_id_uidx on public.external_organizations (source, external_id)';
    end if;
    begin
      alter table public.external_organizations
        add constraint external_organizations_source_external_id_key
        unique using index external_organizations_source_external_id_uidx;
    exception
      when duplicate_object then null;
      when invalid_table_definition then
        alter table public.external_organizations
          add constraint external_organizations_source_external_id_key unique (source, external_id);
    end;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5) Schema health helper for sync preflight (service role / admin)
-- ---------------------------------------------------------------------------
create or replace function public.cq_external_identity_schema_health()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  events_ok boolean;
  orgs_ok boolean;
begin
  select exists (
    select 1
    from pg_constraint
    where conrelid = 'public.external_events'::regclass
      and contype = 'u'
      and conname = 'external_events_source_external_id_key'
  ) into events_ok;

  select exists (
    select 1
    from pg_constraint
    where conrelid = 'public.external_organizations'::regclass
      and contype = 'u'
      and conname = 'external_organizations_source_external_id_key'
  ) into orgs_ok;

  return jsonb_build_object(
    'ok', events_ok and orgs_ok,
    'code', case
      when events_ok and orgs_ok then null
      else 'EVENT_SCHEMA_INCOMPATIBLE'
    end,
    'message', case
      when events_ok and orgs_ok then 'external identity unique constraints present'
      else 'external_events/organizations require UNIQUE(source, external_id)'
    end,
    'external_events_unique_source_external_id', events_ok,
    'external_organizations_unique_source_external_id', orgs_ok,
    'required_constraint', 'UNIQUE (source, external_id)',
    'events_constraint_name', 'external_events_source_external_id_key',
    'organizations_constraint_name', 'external_organizations_source_external_id_key'
  );
end;
$$;

revoke all on function public.cq_external_identity_schema_health() from public;
grant execute on function public.cq_external_identity_schema_health() to service_role;

comment on function public.cq_external_identity_schema_health() is
  'Preflight for event-source sync: confirms UNIQUE(source, external_id) exists.';

-- ---------------------------------------------------------------------------
-- 6) Reload PostgREST so conflict targets match live constraints
-- ---------------------------------------------------------------------------
notify pgrst, 'reload schema';
