-- Private idempotency ledger for one anonymous publishing batch.
-- Authenticated clients cannot read or write this table. The post row itself
-- does not store the batch id or the account.

create table if not exists public.quad_publish_receipts (
  user_id uuid not null references public.profiles(id) on delete cascade,
  idempotency_key text not null,
  batch_id text,
  post_id uuid references public.quad_posts(id) on delete set null,
  status text not null default 'creating' check (status in ('creating', 'published', 'failed', 'deleted')),
  created_at timestamptz not null default now(),
  primary key (user_id, idempotency_key)
);

create index if not exists quad_publish_receipts_owner_batch_idx
  on public.quad_publish_receipts (user_id, batch_id);

alter table public.quad_publish_receipts enable row level security;
revoke all on table public.quad_publish_receipts from public, anon, authenticated;
