-- Friend request notifications: type + actor reference for inbox UI

alter table public.notifications
  add column if not exists actor_id uuid references public.profiles(id) on delete set null;

create index if not exists idx_notifications_actor
  on public.notifications(actor_id)
  where actor_id is not null;

-- Ensure friend_request is allowed (drop/recreate type check idempotently).
alter table public.notifications drop constraint if exists notifications_type_check;

alter table public.notifications add constraint notifications_type_check check (
  type in (
    'direct_message',
    'connection_accepted',
    'friend_request',
    'event_rsvp_reminder',
    'organization_event_announcement',
    'moderation_safety_update',
    'organization_request_submitted',
    'organization_request_approved',
    'organization_request_denied'
  )
);
