-- Per-source event provider health for the Events watchdog.
-- Students must not read this table; writes go through the service-role admin client.

create table if not exists public.event_provider_health (
  source text primary key,
  status text not null default 'healthy'
    check (status in ('healthy', 'degraded', 'recovering', 'circuit_open')),
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_error text,
  current_event_count integer not null default 0,
  last_good_event_count integer not null default 0,
  latest_import_count integer not null default 0,
  consecutive_failures integer not null default 0,
  recovery_attempts integer not null default 0,
  last_recovery_at timestamptz,
  last_recovery_result text,
  circuit_opened_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists idx_event_provider_health_status
  on public.event_provider_health (status, updated_at desc);

alter table public.event_provider_health enable row level security;

drop policy if exists "event_provider_health read admin" on public.event_provider_health;
create policy "event_provider_health read admin"
  on public.event_provider_health for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin', 'super_admin')
    )
  );

comment on table public.event_provider_health is
  'Admin-only per-source Events inventory health. Last-known-good counts prevent athletics-only feed collapse.';
