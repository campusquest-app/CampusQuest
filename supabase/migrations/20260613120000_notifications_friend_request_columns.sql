-- Friend-request notification columns (idempotent).
-- Friend requests are stored in student_connections (no separate friend_requests table).

alter table public.notifications
  add column if not exists actor_id uuid references public.profiles(id) on delete set null;

alter table public.notifications
  add column if not exists friend_request_id uuid references public.student_connections(id) on delete cascade;

alter table public.notifications
  add column if not exists type text;

alter table public.notifications
  add column if not exists read boolean default false;

alter table public.notifications
  add column if not exists created_at timestamptz default now();

-- Columns used by the notifications API (legacy schemas may omit these).
alter table public.notifications
  add column if not exists read_at timestamptz;

alter table public.notifications
  add column if not exists title text;

alter table public.notifications
  add column if not exists body text;

alter table public.notifications
  add column if not exists related_entity_type text;

alter table public.notifications
  add column if not exists related_entity_id uuid;

-- Backfill friend_request_id from related_entity_id for existing friend_request rows.
update public.notifications
set friend_request_id = related_entity_id
where friend_request_id is null
  and type = 'friend_request'
  and related_entity_id is not null;

-- Sync read boolean from legacy is_read / read_at where present.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'notifications' and column_name = 'is_read'
  ) then
    execute $sql$
      update public.notifications
      set read = true
      where read is distinct from true and is_read = true
    $sql$;
  end if;

  execute $sql$
    update public.notifications
    set read = true
    where read is distinct from true and read_at is not null
  $sql$;
end $$;

create index if not exists idx_notifications_actor
  on public.notifications(actor_id)
  where actor_id is not null;

create index if not exists idx_notifications_friend_request
  on public.notifications(friend_request_id)
  where friend_request_id is not null;

-- Ensure friend_request is an allowed notification type.
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
