-- Ensure (source, external_id) uniqueness for external_events / external_organizations.
-- Idempotent reinforcement of 20260831140000. Safe if already applied.
-- Does not delete inventory beyond true duplicate pairs (keeps oldest / admin_override).

-- 1. Deduplicate organizations (keep earliest created_at, then lowest id).
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

-- 2. Deduplicate events (prefer admin_override, then earliest).
with ranked as (
  select
    id,
    row_number() over (
      partition by source, external_id
      order by
        case when coalesce(admin_override, false) then 0 else 1 end,
        created_at asc nulls last,
        id asc
    ) as rn
  from public.external_events
)
delete from public.external_events ee
using ranked r
where ee.id = r.id
  and r.rn > 1;

-- 3. Drop legacy single-column uniqueness if present.
alter table public.external_events drop constraint if exists external_events_external_id_key;
alter table public.external_organizations drop constraint if exists external_organizations_external_id_key;
drop index if exists external_events_external_id_key;
drop index if exists external_organizations_external_id_key;

-- 4. Composite unique indexes.
create unique index if not exists external_events_source_external_id_uidx
  on public.external_events (source, external_id);

create unique index if not exists external_organizations_source_external_id_uidx
  on public.external_organizations (source, external_id);

-- 5. Named unique constraints bound to those indexes.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'external_events_source_external_id_key'
      and conrelid = 'public.external_events'::regclass
  ) then
    alter table public.external_events
      add constraint external_events_source_external_id_key
      unique using index external_events_source_external_id_uidx;
  end if;
exception
  when duplicate_object then null;
  when invalid_table_definition then null;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'external_organizations_source_external_id_key'
      and conrelid = 'public.external_organizations'::regclass
  ) then
    alter table public.external_organizations
      add constraint external_organizations_source_external_id_key
      unique using index external_organizations_source_external_id_uidx;
  end if;
exception
  when duplicate_object then null;
  when invalid_table_definition then null;
end $$;
