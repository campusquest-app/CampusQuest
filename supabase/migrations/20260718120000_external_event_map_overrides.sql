-- Per-event map placement overrides for URInvolved (and future external feeds).
create table if not exists public.external_event_map_overrides (
  id uuid primary key default gen_random_uuid(),
  external_event_id uuid not null references public.external_events (id) on delete cascade,
  realm_location_id text references public.campus_locations (slug) on delete set null,
  custom_lat double precision,
  custom_lng double precision,
  custom_label text,
  match_status text not null default 'auto_matched' check (
    match_status in ('auto_matched', 'manually_adjusted', 'unmatched', 'hidden', 'ignored')
  ),
  match_confidence numeric(5, 4),
  match_reason text,
  raw_location_text text,
  normalized_location_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  unique (external_event_id)
);

create index if not exists idx_external_event_map_overrides_status
  on public.external_event_map_overrides (match_status);

create index if not exists idx_external_event_map_overrides_realm
  on public.external_event_map_overrides (realm_location_id)
  where realm_location_id is not null;

alter table public.external_event_map_overrides enable row level security;

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

-- Service role (sync / map assembly) needs unrestricted access.
drop policy if exists external_event_map_overrides_service_role on public.external_event_map_overrides;
create policy external_event_map_overrides_service_role
  on public.external_event_map_overrides for all
  to service_role
  using (true)
  with check (true);
