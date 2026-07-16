-- Event → map placement pipeline hardening:
-- - explicit placement statuses (pending/resolved/unresolved/invalid/online)
-- - occurrence identity for one marker per event occurrence
-- - public read of placements; writes remain admin + service_role only

alter table public.external_event_map_overrides
  add column if not exists source text not null default 'urinvolved',
  add column if not exists occurrence_start timestamptz;

-- Backfill occurrence_start + source from the parent event row.
update public.external_event_map_overrides o
set
  occurrence_start = coalesce(o.occurrence_start, e.starts_at),
  source = coalesce(nullif(o.source, ''), e.source, 'urinvolved')
from public.external_events e
where e.id = o.external_event_id;

-- Drop the old check BEFORE rewriting legacy status values.
alter table public.external_event_map_overrides
  drop constraint if exists external_event_map_overrides_match_status_check;

-- Normalize legacy statuses onto the new vocabulary where safe.
update public.external_event_map_overrides
set match_status = 'resolved'
where match_status = 'auto_matched';

update public.external_event_map_overrides
set match_status = 'unresolved'
where match_status = 'unmatched';

alter table public.external_event_map_overrides
  add constraint external_event_map_overrides_match_status_check
  check (
    match_status in (
      'pending',
      'resolved',
      'unresolved',
      'invalid',
      'online',
      'auto_matched',
      'manually_adjusted',
      'verified',
      'needs_review',
      'unmatched',
      'hidden',
      'ignored'
    )
  );

-- Exactly one marker per event occurrence (source + event + start).
-- Keep unique(external_event_id) for upsert-on-sync; add occurrence uniqueness too.
create unique index if not exists external_event_map_overrides_occurrence_uidx
  on public.external_event_map_overrides (source, external_event_id, occurrence_start)
  where occurrence_start is not null;

create index if not exists idx_external_event_map_overrides_occurrence
  on public.external_event_map_overrides (occurrence_start desc nulls last);

-- Public read for map clients; only admin / service_role may write.
drop policy if exists external_event_map_overrides_public_read on public.external_event_map_overrides;
create policy external_event_map_overrides_public_read
  on public.external_event_map_overrides
  for select
  to authenticated, anon
  using (
    match_status not in ('hidden', 'ignored')
    and exists (
      select 1
      from public.external_events e
      where e.id = external_event_id
        and e.is_active = true
    )
  );

-- Ensure admin write policy still exists (idempotent).
drop policy if exists external_event_map_overrides_admin_all on public.external_event_map_overrides;
create policy external_event_map_overrides_admin_all
  on public.external_event_map_overrides for all
  to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin', 'super_admin')
  ))
  with check (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin', 'super_admin')
  ));

drop policy if exists external_event_map_overrides_service_role on public.external_event_map_overrides;
create policy external_event_map_overrides_service_role
  on public.external_event_map_overrides for all
  to service_role
  using (true)
  with check (true);
