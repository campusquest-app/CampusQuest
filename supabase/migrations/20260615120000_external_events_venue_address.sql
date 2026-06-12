-- Add venue and address fields for URInvolved imported events.

alter table public.external_events
  add column if not exists venue_name text,
  add column if not exists address text;

create index if not exists idx_external_events_active_venue
  on public.external_events (is_active, venue_name)
  where venue_name is not null;

create index if not exists idx_external_events_active_address
  on public.external_events (is_active, address)
  where address is not null;
