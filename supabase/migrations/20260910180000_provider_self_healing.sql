-- Self-healing provider incidents + allowlisted identity-invariant repair.
-- Additive / idempotent. Does not disable RLS, drop tables, or wipe inventory.

-- ---------------------------------------------------------------------------
-- 1) Detect UNIQUE(source, external_id) even when the constraint name differs
-- ---------------------------------------------------------------------------
create or replace function public.cq_has_unique_source_external_id(p_rel regclass)
returns boolean
language plpgsql
stable
set search_path = public
as $$
declare
  found boolean := false;
  cols name[];
begin
  select exists (
    select 1
    from pg_constraint c
    where c.conrelid = p_rel
      and c.contype in ('u', 'p')
      and (
        select array_agg(att.attname order by u.ord)
        from unnest(c.conkey) with ordinality as u(attnum, ord)
        join pg_attribute att
          on att.attrelid = c.conrelid
         and att.attnum = u.attnum
      ) in (array['source', 'external_id']::name[], array['external_id', 'source']::name[])
  ) into found;
  if found then
    return true;
  end if;

  select exists (
    select 1
    from pg_index i
    where i.indrelid = p_rel
      and i.indisunique
      and (
        select array_agg(att.attname order by x.n)
        from generate_subscripts(i.indkey, 1) as x(n)
        join pg_attribute att
          on att.attrelid = i.indrelid
         and att.attnum = i.indkey[x.n]
        where x.n <= i.indnkeyatts
      ) in (array['source', 'external_id']::name[], array['external_id', 'source']::name[])
  ) into found;

  return found;
end;
$$;

revoke all on function public.cq_has_unique_source_external_id(regclass) from public;
grant execute on function public.cq_has_unique_source_external_id(regclass) to service_role;

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
  missing text;
begin
  events_ok := public.cq_has_unique_source_external_id('public.external_events'::regclass);
  orgs_ok := public.cq_has_unique_source_external_id('public.external_organizations'::regclass);
  missing := trim(both ' and ' from concat_ws(
    ' and ',
    case when not events_ok then 'external_events' end,
    case when not orgs_ok then 'external_organizations' end
  ));

  return jsonb_build_object(
    'ok', events_ok and orgs_ok,
    'code', case when events_ok and orgs_ok then null else 'EVENT_SCHEMA_INCOMPATIBLE' end,
    'message', case
      when events_ok and orgs_ok then 'external identity unique constraints present'
      else missing || ' requires UNIQUE(source, external_id)'
    end,
    'external_events_unique_source_external_id', events_ok,
    'external_organizations_unique_source_external_id', orgs_ok,
    'required_constraint', 'UNIQUE (source, external_id)',
    'events_constraint_name', 'external_events_source_external_id_key',
    'organizations_constraint_name', 'external_organizations_source_external_id_key',
    'repair_rpc', 'cq_repair_external_identity_invariant'
  );
end;
$$;

revoke all on function public.cq_external_identity_schema_health() from public;
grant execute on function public.cq_external_identity_schema_health() to service_role;

-- ---------------------------------------------------------------------------
-- 2) Allowlisted repair: create UNIQUE(source, external_id) after safe dedupe
-- ---------------------------------------------------------------------------
create or replace function public.cq_repair_external_identity_invariant()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  health jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('cq_repair_external_identity_invariant'));

  -- Organizations: re-point events away from duplicate losers, then drop losers.
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

  -- Events: re-point RSVPs / map overrides / canonical refs, then drop losers.
  create temporary table if not exists _cq_ext_event_dupes (
    loser_id uuid not null,
    keeper_id uuid not null
  ) on commit drop;
  truncate _cq_ext_event_dupes;

  insert into _cq_ext_event_dupes (loser_id, keeper_id)
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
  select r.id, k.id
  from ranked r
  join ranked k
    on k.source = r.source
   and k.external_id = r.external_id
   and k.rn = 1
  where r.rn > 1;

  update public.external_event_rsvps rsvp
  set event_id = d.keeper_id
  from _cq_ext_event_dupes d
  where rsvp.event_id = d.loser_id
    and not exists (
      select 1
      from public.external_event_rsvps other
      where other.event_id = d.keeper_id
        and other.user_id = rsvp.user_id
    );

  delete from public.external_event_rsvps rsvp
  using _cq_ext_event_dupes d
  where rsvp.event_id = d.loser_id;

  update public.external_event_map_overrides ov
  set external_event_id = d.keeper_id
  from _cq_ext_event_dupes d
  where ov.external_event_id = d.loser_id
    and not exists (
      select 1
      from public.external_event_map_overrides other
      where other.external_event_id = d.keeper_id
    );

  delete from public.external_event_map_overrides ov
  using _cq_ext_event_dupes d
  where ov.external_event_id = d.loser_id;

  update public.external_events e
  set canonical_event_id = null
  from _cq_ext_event_dupes d
  where e.canonical_event_id = d.loser_id;

  delete from public.external_events e
  using _cq_ext_event_dupes d
  where e.id = d.loser_id;

  alter table public.external_events drop constraint if exists external_events_external_id_key;
  alter table public.external_organizations drop constraint if exists external_organizations_external_id_key;
  drop index if exists public.external_events_external_id_key;
  drop index if exists public.external_organizations_external_id_key;

  create unique index if not exists external_events_source_external_id_uidx
    on public.external_events (source, external_id);
  create unique index if not exists external_organizations_source_external_id_uidx
    on public.external_organizations (source, external_id);

  begin
    if not exists (
      select 1 from pg_constraint
      where conname = 'external_events_source_external_id_key'
        and conrelid = 'public.external_events'::regclass
    ) then
      begin
        alter table public.external_events
          add constraint external_events_source_external_id_key
          unique using index external_events_source_external_id_uidx;
      exception
        when duplicate_object then null;
        when invalid_table_definition then
          alter table public.external_events
            add constraint external_events_source_external_id_key unique (source, external_id);
      end;
    end if;
  exception
    when duplicate_object then null;
    when unique_violation then null;
  end;

  begin
    if not exists (
      select 1 from pg_constraint
      where conname = 'external_organizations_source_external_id_key'
        and conrelid = 'public.external_organizations'::regclass
    ) then
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
  exception
    when duplicate_object then null;
    when unique_violation then null;
  end;

  notify pgrst, 'reload schema';
  health := public.cq_external_identity_schema_health();
  return health || jsonb_build_object('repaired', true, 'action', 'ensure_unique_source_external_id');
end;
$$;

revoke all on function public.cq_repair_external_identity_invariant() from public;
grant execute on function public.cq_repair_external_identity_invariant() to service_role;

comment on function public.cq_repair_external_identity_invariant() is
  'Allowlisted self-healing repair: UNIQUE(source, external_id) on external_events/organizations after safe duplicate re-point.';

-- ---------------------------------------------------------------------------
-- 3) Incidents (admin-only)
-- ---------------------------------------------------------------------------
create table if not exists public.provider_incidents (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  incident_type text not null,
  error_code text,
  error_message text,
  technical_details text,
  detected_at timestamptz not null default now(),
  last_success_at timestamptz,
  attempted_at timestamptz,
  resolved_at timestamptz,
  status text not null default 'detected'
    check (status in (
      'detected',
      'diagnosing',
      'repairing',
      'awaiting_deployment',
      'verifying',
      'resolved',
      'manual_review_required',
      'failed_repair'
    )),
  repair_action text,
  repair_attempts integer not null default 0,
  deployment_commit text,
  inventory_before jsonb not null default '{}'::jsonb,
  inventory_after jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists idx_provider_incidents_provider_detected
  on public.provider_incidents (provider, detected_at desc);

create unique index if not exists provider_incidents_one_open_repair
  on public.provider_incidents (provider)
  where status in ('diagnosing', 'repairing', 'awaiting_deployment', 'verifying');

alter table public.provider_incidents enable row level security;

drop policy if exists "provider_incidents read admin" on public.provider_incidents;
create policy "provider_incidents read admin"
  on public.provider_incidents for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin', 'super_admin')
    )
  );

comment on table public.provider_incidents is
  'Admin-only production incidents for event-provider self-healing. No student access.';

-- ---------------------------------------------------------------------------
-- 4) Expand provider health statuses used during repair
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.event_provider_health') is null then
    return;
  end if;
  alter table public.event_provider_health drop constraint if exists event_provider_health_status_check;
  alter table public.event_provider_health
    add constraint event_provider_health_status_check
    check (status in (
      'healthy',
      'degraded',
      'recovering',
      'circuit_open',
      'failed',
      'repairing',
      'configuration_required'
    ));
end
$$;

notify pgrst, 'reload schema';

-- Verification (read-only; safe to re-run in the SQL editor after apply):
--   select public.cq_has_unique_source_external_id('public.external_events'::regclass);
--   select public.cq_has_unique_source_external_id('public.external_organizations'::regclass);
--   select public.cq_external_identity_schema_health();
-- Duplicate groups should be empty after repair:
--   select source, external_id, count(*) from public.external_events group by 1, 2 having count(*) > 1;
--   select source, external_id, count(*) from public.external_organizations group by 1, 2 having count(*) > 1;
