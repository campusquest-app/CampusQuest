-- Student-to-student messaging, connection gating, safety controls, moderation

create table if not exists public.student_connections (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  responded_at timestamptz,
  check (requester_id <> addressee_id)
);

create unique index if not exists idx_student_connections_pair_unique
  on public.student_connections (least(requester_id, addressee_id), greatest(requester_id, addressee_id));

create index if not exists idx_student_connections_requester_status
  on public.student_connections(requester_id, status, created_at desc);

create index if not exists idx_student_connections_addressee_status
  on public.student_connections(addressee_id, status, created_at desc);

create table if not exists public.direct_conversations (
  id uuid primary key default gen_random_uuid(),
  direct_key text not null unique,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.direct_conversation_participants (
  conversation_id uuid not null references public.direct_conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create index if not exists idx_direct_conversation_participants_user
  on public.direct_conversation_participants(user_id, updated_at desc);

create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.direct_conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 2000),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (sender_id <> recipient_id)
);

create index if not exists idx_direct_messages_conversation_created
  on public.direct_messages(conversation_id, created_at desc);

create index if not exists idx_direct_messages_recipient_read
  on public.direct_messages(recipient_id, read_at, created_at desc);

create table if not exists public.blocked_users (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create index if not exists idx_blocked_users_blocker
  on public.blocked_users(blocker_id, created_at desc);

create table if not exists public.message_reports (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.direct_messages(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reported_user_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (reason in ('harassment', 'threat', 'scam', 'impersonation', 'discrimination', 'unsafe', 'other')),
  details text,
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  moderator_note text,
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (message_id, reporter_id)
);

create index if not exists idx_message_reports_status_created
  on public.message_reports(status, created_at desc);

drop trigger if exists trg_student_connections_updated_at on public.student_connections;
create trigger trg_student_connections_updated_at
before update on public.student_connections
for each row execute function public.set_updated_at();

drop trigger if exists trg_direct_conversations_updated_at on public.direct_conversations;
create trigger trg_direct_conversations_updated_at
before update on public.direct_conversations
for each row execute function public.set_updated_at();

drop trigger if exists trg_direct_conversation_participants_updated_at on public.direct_conversation_participants;
create trigger trg_direct_conversation_participants_updated_at
before update on public.direct_conversation_participants
for each row execute function public.set_updated_at();

drop trigger if exists trg_direct_messages_updated_at on public.direct_messages;
create trigger trg_direct_messages_updated_at
before update on public.direct_messages
for each row execute function public.set_updated_at();

drop trigger if exists trg_blocked_users_updated_at on public.blocked_users;
create trigger trg_blocked_users_updated_at
before update on public.blocked_users
for each row execute function public.set_updated_at();

drop trigger if exists trg_message_reports_updated_at on public.message_reports;
create trigger trg_message_reports_updated_at
before update on public.message_reports
for each row execute function public.set_updated_at();

alter table public.student_connections enable row level security;
alter table public.direct_conversations enable row level security;
alter table public.direct_conversation_participants enable row level security;
alter table public.direct_messages enable row level security;
alter table public.blocked_users enable row level security;
alter table public.message_reports enable row level security;

drop policy if exists "student_connections own rows" on public.student_connections;
create policy "student_connections own rows"
on public.student_connections for all
to authenticated
using (auth.uid() = requester_id or auth.uid() = addressee_id)
with check (auth.uid() = requester_id or auth.uid() = addressee_id);

drop policy if exists "direct_conversations participant read" on public.direct_conversations;
create policy "direct_conversations participant read"
on public.direct_conversations for select
to authenticated
using (
  exists (
    select 1
    from public.direct_conversation_participants dcp
    where dcp.conversation_id = direct_conversations.id
      and dcp.user_id = auth.uid()
  )
);

drop policy if exists "direct_conversation_participants own rows" on public.direct_conversation_participants;
create policy "direct_conversation_participants own rows"
on public.direct_conversation_participants for all
to authenticated
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
);

drop policy if exists "direct_messages participant read" on public.direct_messages;
create policy "direct_messages participant read"
on public.direct_messages for select
to authenticated
using (
  exists (
    select 1
    from public.direct_conversation_participants dcp
    where dcp.conversation_id = direct_messages.conversation_id
      and dcp.user_id = auth.uid()
  )
);

drop policy if exists "direct_messages sender insert" on public.direct_messages;
create policy "direct_messages sender insert"
on public.direct_messages for insert
to authenticated
with check (
  auth.uid() = sender_id
  and exists (
    select 1
    from public.direct_conversation_participants dcp
    where dcp.conversation_id = direct_messages.conversation_id
      and dcp.user_id = auth.uid()
  )
);

drop policy if exists "direct_messages recipient update read" on public.direct_messages;
create policy "direct_messages recipient update read"
on public.direct_messages for update
to authenticated
using (auth.uid() = recipient_id)
with check (auth.uid() = recipient_id);

drop policy if exists "blocked_users own rows" on public.blocked_users;
create policy "blocked_users own rows"
on public.blocked_users for all
to authenticated
using (auth.uid() = blocker_id)
with check (auth.uid() = blocker_id);

drop policy if exists "message_reports own rows" on public.message_reports;
create policy "message_reports own rows"
on public.message_reports for all
to authenticated
using (
  auth.uid() = reporter_id
  or exists (
    select 1
    from public.direct_messages dm
    join public.direct_conversation_participants dcp
      on dcp.conversation_id = dm.conversation_id
    where dm.id = message_reports.message_id
      and dcp.user_id = auth.uid()
  )
)
with check (auth.uid() = reporter_id);
