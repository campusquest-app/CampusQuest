-- Last-resort DB guard: a failed provider sync must not hide a whole source overnight.
-- Application code already refuses this; production Vercel has repeatedly run older
-- ON CONFLICT upserts that soft-deactivate every URInvolved row when upserts fail.
-- Additive. Does not disable RLS, remove tables, or wipe inventory.

create or replace function public.cq_guard_external_event_mass_deactivate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  src text;
  deactivated integer;
  remaining_active integer;
  active_before integer;
begin
  for src in select distinct source from old_rows
  loop
    select count(*)::integer into deactivated
    from old_rows o
    join new_rows n on n.id = o.id
    where o.source = src
      and coalesce(o.is_active, false) = true
      and coalesce(n.is_active, false) = false;

    if deactivated = 0 then
      continue;
    end if;

    select count(*)::integer into remaining_active
    from public.external_events e
    where e.source = src
      and coalesce(e.is_active, false) = true;

    active_before := remaining_active + deactivated;

    if active_before >= 25 and deactivated > (active_before::numeric * 0.5) then
      raise exception
        'CQ_REFUSE_MASS_DEACTIVATE: refusing to deactivate % of % active % events in one statement',
        deactivated, active_before, src
        using errcode = 'P0001';
    end if;
  end loop;

  return null;
end;
$$;

revoke all on function public.cq_guard_external_event_mass_deactivate() from public;
grant execute on function public.cq_guard_external_event_mass_deactivate() to service_role;

drop trigger if exists cq_guard_external_event_mass_deactivate on public.external_events;
create trigger cq_guard_external_event_mass_deactivate
  after update on public.external_events
  referencing old table as old_rows new table as new_rows
  for each statement
  execute function public.cq_guard_external_event_mass_deactivate();

comment on function public.cq_guard_external_event_mass_deactivate() is
  'Blocks a single UPDATE that deactivates more than 50% of a source with 25+ active events.';

-- Stale PostgREST caches still 42P10 on ON CONFLICT even when UNIQUE(source, external_id) exists.
notify pgrst, 'reload schema';
