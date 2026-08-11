-- Push notification device tokens + lightweight preference flags (idempotent).

create table if not exists public.push_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  platform text not null check (platform in ('ios', 'android', 'web')),
  device_token text not null,
  device_id text,
  app_version text,
  environment text not null default 'production'
    check (environment in ('development', 'production')),
  enabled boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_devices_token_unique unique (device_token)
);

create index if not exists idx_push_devices_user_enabled
  on public.push_devices (user_id)
  where enabled = true;

create index if not exists idx_push_devices_user_platform
  on public.push_devices (user_id, platform);

alter table public.push_devices enable row level security;

drop policy if exists push_devices_select_own on public.push_devices;
create policy push_devices_select_own
  on public.push_devices for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists push_devices_insert_own on public.push_devices;
create policy push_devices_insert_own
  on public.push_devices for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists push_devices_update_own on public.push_devices;
create policy push_devices_update_own
  on public.push_devices for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists push_devices_delete_own on public.push_devices;
create policy push_devices_delete_own
  on public.push_devices for delete
  to authenticated
  using (auth.uid() = user_id);

-- Simple v1 channel preferences (defaults = all on).
create table if not exists public.user_push_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  push_enabled boolean not null default true,
  messages_enabled boolean not null default true,
  social_enabled boolean not null default true,
  events_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.user_push_settings enable row level security;

drop policy if exists user_push_settings_select_own on public.user_push_settings;
create policy user_push_settings_select_own
  on public.user_push_settings for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists user_push_settings_upsert_own on public.user_push_settings;
create policy user_push_settings_upsert_own
  on public.user_push_settings for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

comment on table public.push_devices is
  'APNs/FCM device tokens. Tokens are never returned to other users; sending uses service role.';
comment on table public.user_push_settings is
  'Per-user push category toggles for CampusQuest native notifications.';
