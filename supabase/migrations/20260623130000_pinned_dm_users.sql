-- Per-user pinned DM contacts for inbox quick access

create table if not exists public.pinned_dm_users (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pinned_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, pinned_user_id),
  constraint pinned_dm_users_no_self check (user_id <> pinned_user_id)
);

create index if not exists idx_pinned_dm_users_user_id
  on public.pinned_dm_users (user_id);

create index if not exists idx_pinned_dm_users_pinned_user_id
  on public.pinned_dm_users (pinned_user_id);

create index if not exists idx_pinned_dm_users_created_at
  on public.pinned_dm_users (created_at);

alter table public.pinned_dm_users enable row level security;

drop policy if exists "pinned_dm_users own select" on public.pinned_dm_users;
create policy "pinned_dm_users own select"
on public.pinned_dm_users for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "pinned_dm_users own insert" on public.pinned_dm_users;
create policy "pinned_dm_users own insert"
on public.pinned_dm_users for insert
to authenticated
with check (auth.uid() = user_id and auth.uid() <> pinned_user_id);

drop policy if exists "pinned_dm_users own delete" on public.pinned_dm_users;
create policy "pinned_dm_users own delete"
on public.pinned_dm_users for delete
to authenticated
using (auth.uid() = user_id);

-- Updates are not used; default deny keeps pins immutable aside from delete + re-insert.

comment on table public.pinned_dm_users is 'Users pinned to the top DM inbox row by the logged-in account.';
comment on column public.pinned_dm_users.user_id is 'Account that created the pin.';
comment on column public.pinned_dm_users.pinned_user_id is 'Other user pinned for quick DM access.';
