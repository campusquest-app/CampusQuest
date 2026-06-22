-- Group DM support: extend direct_conversations for multi-member threads

alter table public.direct_conversations
  add column if not exists type text not null default 'direct',
  add column if not exists title text;

alter table public.direct_conversations
  drop constraint if exists direct_conversations_type_check;

alter table public.direct_conversations
  add constraint direct_conversations_type_check
  check (type in ('direct', 'group'));

-- Groups do not use direct_key; existing 1:1 rows keep their keys
alter table public.direct_conversations
  alter column direct_key drop not null;

alter table public.direct_conversation_participants
  add column if not exists role text not null default 'member',
  add column if not exists joined_at timestamptz not null default now();

alter table public.direct_conversation_participants
  drop constraint if exists direct_conversation_participants_role_check;

alter table public.direct_conversation_participants
  add constraint direct_conversation_participants_role_check
  check (role in ('owner', 'member'));

-- Group messages may omit a single recipient
alter table public.direct_messages
  alter column recipient_id drop not null;

alter table public.direct_messages
  drop constraint if exists direct_messages_check;

alter table public.direct_messages
  add constraint direct_messages_recipient_check
  check (recipient_id is null or sender_id <> recipient_id);

create index if not exists idx_direct_conversations_type_updated
  on public.direct_conversations (type, updated_at desc);

comment on column public.direct_conversations.type is 'direct = 1:1 via direct_key; group = multi-member';
comment on column public.direct_conversations.title is 'Optional group display name';
comment on column public.direct_conversation_participants.role is 'owner = creator; member = participant';
