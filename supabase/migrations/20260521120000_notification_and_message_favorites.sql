-- Notification favorites (notifications rows are scoped by user_id).
-- Direct message favorites are per-user bookmarks of specific messages.

alter table public.notifications
  add column if not exists is_favorited boolean not null default false,
  add column if not exists favorited_at timestamptz;

comment on column public.notifications.is_favorited is 'Recipient marked this notification as a favorite (ordered first in inbox).';
comment on column public.notifications.favorited_at is 'When favorited; cleared when unfavorited';

-- Replace earlier index name if present (idempotent reorder / column set).
drop index if exists public.idx_notifications_user_fav_created;

create index if not exists notifications_user_favorite_sort_idx
  on public.notifications (user_id, is_favorited desc, favorited_at desc, created_at desc);

-- Per-user message bookmarks (same message can be favorited independently by each participant).
create table if not exists public.direct_message_favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  message_id uuid not null references public.direct_messages(id) on delete cascade,
  favorited_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, message_id)
);

create index if not exists idx_direct_message_favorites_user
  on public.direct_message_favorites(user_id, favorited_at desc);

create index if not exists idx_direct_message_favorites_message
  on public.direct_message_favorites(message_id);

alter table public.direct_message_favorites enable row level security;

drop policy if exists "direct_message_favorites own select" on public.direct_message_favorites;
create policy "direct_message_favorites own select"
on public.direct_message_favorites for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "direct_message_favorites own insert" on public.direct_message_favorites;
create policy "direct_message_favorites own insert"
on public.direct_message_favorites for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "direct_message_favorites own update" on public.direct_message_favorites;
create policy "direct_message_favorites own update"
on public.direct_message_favorites for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "direct_message_favorites own delete" on public.direct_message_favorites;
create policy "direct_message_favorites own delete"
on public.direct_message_favorites for delete
to authenticated
using (auth.uid() = user_id);
