-- Per-user conversation hiding without deleting message records

alter table public.direct_conversation_participants
  add column if not exists hidden_at timestamptz;

create index if not exists idx_direct_conversation_participants_hidden
  on public.direct_conversation_participants(user_id, hidden_at);
