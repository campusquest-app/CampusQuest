-- Read-only checks for UNIQUE(source, external_id) on imported campus events.
-- Run in the Supabase SQL editor after applying 20260905190000 and 20260910180000.

select
  public.cq_has_unique_source_external_id('public.external_events'::regclass) as events_unique,
  public.cq_has_unique_source_external_id('public.external_organizations'::regclass) as orgs_unique;

select public.cq_external_identity_schema_health();

select source, external_id, count(*) as duplicates
from public.external_events
group by source, external_id
having count(*) > 1;

select source, external_id, count(*) as duplicates
from public.external_organizations
group by source, external_id
having count(*) > 1;

-- Same external_id may exist under different sources:
select external_id, count(distinct source) as sources
from public.external_events
group by external_id
having count(distinct source) > 1
limit 20;
