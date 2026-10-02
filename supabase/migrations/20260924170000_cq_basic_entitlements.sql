-- CQ Basic entitlement storage.
--
-- cq_basic_access is one row per profile. Authenticated users may read their
-- own row. They cannot insert, update, or delete it. A trigger also rejects
-- writes whose JWT role is anon or authenticated, so a later policy cannot
-- turn the client into a grant path. Service-role and database-owner writes
-- still work for the local test grant.
--
-- cq_saved_items is a private bookmark list. Reads are limited to the owner.
-- Inserts and reminder updates require an active access window
-- (starts_at <= now < ends_at). Deletes require only user_id = auth.uid(),
-- so a former Basic member can remove their own rows after the window ends.
-- early_access is stored on the access row and is effective only while that
-- same window is active. Reminder is a stored preference only. Nothing in
-- this migration sends email.
--
-- This migration only creates cq_basic_access and cq_saved_items. It does
-- not alter, update, or delete existing account, profile, or event rows.

create table if not exists public.cq_basic_access (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  early_access boolean not null default false, -- effective only while starts_at <= now() and now() < ends_at
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cq_basic_access_window check (ends_at > starts_at)
);

drop trigger if exists trg_cq_basic_access_updated_at on public.cq_basic_access;
create trigger trg_cq_basic_access_updated_at
before update on public.cq_basic_access
for each row execute function public.set_updated_at();

create or replace function public.cq_basic_access_block_client_writes()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  jwt_role text := coalesce(auth.role(), '');
begin
  if jwt_role in ('anon', 'authenticated') then
    raise exception 'basic access cannot be granted from the client';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_cq_basic_access_block_client_writes on public.cq_basic_access;
create trigger trg_cq_basic_access_block_client_writes
before insert or update or delete on public.cq_basic_access
for each row execute function public.cq_basic_access_block_client_writes();

alter table public.cq_basic_access enable row level security;

drop policy if exists "cq_basic_access read own" on public.cq_basic_access;
create policy "cq_basic_access read own"
on public.cq_basic_access
for select
to authenticated
using (user_id = auth.uid());

revoke all on table public.cq_basic_access from public;
revoke all on table public.cq_basic_access from anon;
revoke all on table public.cq_basic_access from authenticated;
grant select on table public.cq_basic_access to authenticated;

revoke all on function public.cq_basic_access_block_client_writes() from public;
revoke all on function public.cq_basic_access_block_client_writes() from anon;
revoke all on function public.cq_basic_access_block_client_writes() from authenticated;

create table if not exists public.cq_saved_items (
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('event', 'club', 'organization')),
  target_id uuid not null,
  reminder text not null default 'off' check (reminder in ('off', 'email')),
  created_at timestamptz not null default now(),
  primary key (user_id, kind, target_id),
  constraint cq_saved_items_reminder_events_only check (kind = 'event' or reminder = 'off')
);

create index if not exists idx_cq_saved_items_user_kind_created
  on public.cq_saved_items (user_id, kind, created_at desc);

create or replace function public.cq_saved_items_keep_identity()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.user_id is distinct from old.user_id
    or new.kind is distinct from old.kind
    or new.target_id is distinct from old.target_id
    or new.created_at is distinct from old.created_at then
    raise exception 'saved item identity cannot be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_cq_saved_items_keep_identity on public.cq_saved_items;
create trigger trg_cq_saved_items_keep_identity
before update on public.cq_saved_items
for each row execute function public.cq_saved_items_keep_identity();

alter table public.cq_saved_items enable row level security;

drop policy if exists "cq_saved_items read own" on public.cq_saved_items;
create policy "cq_saved_items read own"
on public.cq_saved_items
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "cq_saved_items insert own active" on public.cq_saved_items;
create policy "cq_saved_items insert own active"
on public.cq_saved_items
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.cq_basic_access access
    where access.user_id = auth.uid()
      and access.starts_at <= now()
      and now() < access.ends_at
  )
);

drop policy if exists "cq_saved_items update own active" on public.cq_saved_items;
create policy "cq_saved_items update own active"
on public.cq_saved_items
for update
to authenticated
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.cq_basic_access access
    where access.user_id = auth.uid()
      and access.starts_at <= now()
      and now() < access.ends_at
  )
);

drop policy if exists "cq_saved_items delete own active" on public.cq_saved_items;
drop policy if exists "cq_saved_items delete own" on public.cq_saved_items;
create policy "cq_saved_items delete own"
on public.cq_saved_items
for delete
to authenticated
using (user_id = auth.uid());

revoke all on table public.cq_saved_items from public;
revoke all on table public.cq_saved_items from anon;
revoke all on table public.cq_saved_items from authenticated;
grant select, insert, update, delete on table public.cq_saved_items to authenticated;

revoke all on function public.cq_saved_items_keep_identity() from public;
revoke all on function public.cq_saved_items_keep_identity() from anon;
revoke all on function public.cq_saved_items_keep_identity() from authenticated;

comment on table public.cq_basic_access is
  'One CQ Basic access window per profile. Clients can read their own row and cannot grant or extend it.';

comment on column public.cq_basic_access.early_access is
  'Stored flag. Effective only while starts_at <= now() and now() < ends_at.';

comment on table public.cq_saved_items is
  'Private saved events, clubs, and organizations. Reminder stores off or email and does not send mail.';
