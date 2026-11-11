-- Admin push announcements. Not applied to production in this change.
-- Device tokens stay on push_devices. This audit log stores counts and outcomes, not tokens.

alter table public.user_push_settings
  add column if not exists announcements_enabled boolean not null default true;

alter table public.user_push_settings
  add column if not exists perks_enabled boolean not null default false;

alter table public.push_devices
  add column if not exists permission_status text;

alter table public.push_devices drop constraint if exists push_devices_permission_status_check;
alter table public.push_devices
  add constraint push_devices_permission_status_check
  check (permission_status is null or permission_status in ('granted', 'denied', 'unknown'));

create table if not exists public.push_broadcasts (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles (id) on delete restrict,
  idempotency_key uuid not null,
  content_key text not null,
  mode text not null check (mode in ('test', 'audience')),
  audience text not null check (audience in ('opted_in', 'verified_students', 'local_business', 'user')),
  audience_user_id uuid,
  category text not null check (category in ('announcements', 'perks')),
  title text not null,
  body text not null,
  destination jsonb not null,
  status text not null default 'sending' check (status in ('dry_run', 'queued', 'sending', 'completed', 'failed')),
  in_app_count integer not null default 0,
  push_count integer not null default 0,
  in_app_written boolean not null default false,
  accepted_count integer not null default 0,
  failed_count integer not null default 0,
  skipped jsonb not null default '{}'::jsonb,
  apple_contacted boolean not null default false,
  created_at timestamptz not null default now(),
  constraint push_broadcasts_idempotency_unique unique (idempotency_key)
);

create index if not exists idx_push_broadcasts_created_by
  on public.push_broadcasts (created_by, created_at desc);

alter table public.push_broadcasts enable row level security;

comment on table public.push_broadcasts is
  'Admin announcement sends. No client policies: only server-side admin code writes this table. apple_contacted means Apple accepted or rejected a request, not that a phone displayed it.';

create table if not exists public.push_broadcast_attempts (
  id uuid primary key default gen_random_uuid(),
  broadcast_id uuid not null references public.push_broadcasts (id) on delete cascade,
  user_id uuid not null,
  device_id uuid,
  outcome text not null check (outcome in ('accepted', 'rejected', 'invalid_token', 'not_configured')),
  apns_status integer,
  apns_reason text,
  apns_id text,
  created_at timestamptz not null default now()
);

create unique index if not exists push_broadcast_attempts_device_unique
  on public.push_broadcast_attempts (broadcast_id, user_id, device_id)
  where device_id is not null;

create unique index if not exists push_broadcast_attempts_user_unique
  on public.push_broadcast_attempts (broadcast_id, user_id)
  where device_id is null;

alter table public.push_broadcast_attempts enable row level security;

comment on table public.push_broadcast_attempts is
  'One row per APNs request. Stores Apple acceptance or the error reason. The token itself stays on push_devices. Acceptance is not the same as the phone displaying the alert.';

alter table public.notifications
  add column if not exists source_broadcast_id uuid;

create unique index if not exists notifications_user_broadcast_unique
  on public.notifications (user_id, source_broadcast_id)
  where source_broadcast_id is not null;

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (
  type in (
    'direct_message',
    'connection_accepted',
    'friend_request',
    'quad_post_like',
    'quad_post_ember',
    'quad_post_comment',
    'quad_post_tag',
    'quad_post_mention',
    'quad_post_tag_approval',
    'event_rsvp_reminder',
    'organization_event_announcement',
    'moderation_safety_update',
    'organization_request_submitted',
    'organization_request_approved',
    'organization_request_denied',
    'marketplace_offer',
    'marketplace_offer_accepted',
    'marketplace_offer_declined',
    'verification_request_submitted',
    'verification_request_approved',
    'verification_request_needs_info',
    'verification_request_rejected',
    'campus_announcement'
  )
);
