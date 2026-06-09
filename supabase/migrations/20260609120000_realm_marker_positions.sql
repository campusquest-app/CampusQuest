-- Realm map configuration (marker positions, future map settings).
-- Key-value store: config_key = 'marker_positions', config_value = { locationId: { x, y } }.

create table if not exists public.campus_realm_config (
  id uuid primary key default gen_random_uuid(),
  config_key text unique not null,
  config_value jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

-- Migrate legacy scope / marker_positions_json layout if an older local migration ran first.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'campus_realm_config'
      and column_name = 'scope'
  ) then
    create temp table _campus_realm_config_legacy on commit drop as
    select marker_positions_json, updated_at, updated_by
    from public.campus_realm_config;

    drop table public.campus_realm_config cascade;

    create table public.campus_realm_config (
      id uuid primary key default gen_random_uuid(),
      config_key text unique not null,
      config_value jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      updated_by uuid references auth.users(id) on delete set null
    );

    insert into public.campus_realm_config (config_key, config_value, updated_at, updated_by)
    select 'marker_positions', coalesce(marker_positions_json, '{}'::jsonb), updated_at, updated_by
    from _campus_realm_config_legacy
    limit 1;
  end if;
end $$;

create index if not exists campus_realm_config_key_idx on public.campus_realm_config (config_key);

drop trigger if exists trg_campus_realm_config_updated_at on public.campus_realm_config;
create trigger trg_campus_realm_config_updated_at
before update on public.campus_realm_config
for each row execute function public.set_updated_at();

alter table public.campus_realm_config enable row level security;

drop policy if exists "campus_realm_config read authenticated" on public.campus_realm_config;
create policy "campus_realm_config read authenticated"
on public.campus_realm_config for select
to authenticated
using (true);

drop policy if exists "campus_realm_config admin insert" on public.campus_realm_config;
create policy "campus_realm_config admin insert"
on public.campus_realm_config for insert
to authenticated
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin', 'super_admin')
  )
);

drop policy if exists "campus_realm_config admin update" on public.campus_realm_config;
create policy "campus_realm_config admin update"
on public.campus_realm_config for update
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin', 'super_admin')
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin', 'super_admin')
  )
);

drop policy if exists "campus_realm_config admin delete" on public.campus_realm_config;
create policy "campus_realm_config admin delete"
on public.campus_realm_config for delete
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin', 'super_admin')
  )
);

insert into public.campus_realm_config (config_key, config_value)
values ('marker_positions', '{}'::jsonb)
on conflict (config_key) do nothing;
