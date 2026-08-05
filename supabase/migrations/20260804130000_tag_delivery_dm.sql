-- Tag notification + automatic shared-post DM deliveries.
-- Idempotent log so retries cannot duplicate notification/DM for the same tag.

-- Allow an optional 'system' message type alongside existing rich DM types.
alter table public.direct_messages
  drop constraint if exists direct_messages_type_check;

alter table public.direct_messages
  add constraint direct_messages_type_check
  check (type in ('text', 'image', 'shared_post', 'audio', 'system'));

create table if not exists public.tag_deliveries (
  id uuid primary key default gen_random_uuid(),
  tag_id uuid not null references public.post_tags (id) on delete cascade,
  recipient_user_id uuid not null references public.profiles (id) on delete cascade,
  post_id uuid not null references public.quad_posts (id) on delete cascade,
  notification_id uuid null references public.notifications (id) on delete set null,
  message_id uuid null references public.direct_messages (id) on delete set null,
  notification_delivered_at timestamptz null,
  dm_delivered_at timestamptz null,
  created_at timestamptz not null default now(),
  unique (tag_id, recipient_user_id)
);

create index if not exists tag_deliveries_post_recipient_idx
  on public.tag_deliveries (post_id, recipient_user_id);

create index if not exists tag_deliveries_recipient_idx
  on public.tag_deliveries (recipient_user_id);

-- One shared-post DM per post+recipient across all tags (composer + photo).
create unique index if not exists tag_deliveries_one_dm_per_post_recipient
  on public.tag_deliveries (post_id, recipient_user_id)
  where message_id is not null;

alter table public.tag_deliveries enable row level security;

-- Recipients can read their own delivery rows (debug/support); writes are service-role only.
drop policy if exists "Recipients read own tag deliveries" on public.tag_deliveries;
create policy "Recipients read own tag deliveries"
  on public.tag_deliveries for select
  to authenticated
  using (recipient_user_id = auth.uid());
