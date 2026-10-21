-- Link imported events to external_organizations when the stored host name
-- uniquely matches a directory org for the same source. Does not invent hosts
-- from titles. Multi-host strings (commas / " and ") are left unresolved.
-- Provider source (urinvolved, athletics, …) stays on external_events.source.

update public.external_events e
set organization_id = o.id
from public.external_organizations o
where e.organization_id is null
  and e.source = o.source
  and e.organization_name is not null
  and btrim(e.organization_name) <> ''
  and position(',' in e.organization_name) = 0
  and e.organization_name !~* '\sand\s'
  and lower(btrim(e.organization_name)) = lower(btrim(o.name))
  and not exists (
    select 1
    from public.external_organizations o2
    where o2.source = e.source
      and o2.id <> o.id
      and lower(btrim(o2.name)) = lower(btrim(e.organization_name))
  );
