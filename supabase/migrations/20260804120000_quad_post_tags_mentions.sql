-- Instagram-style tags & mentions for Quad posts.
-- Polymorphic entity_id validated server-side (user | organization | event | external_event).

-- Slugs for org/event @mentions (profiles already use username).
alter table public.student_organizations
  add column if not exists mention_slug text;

alter table public.campus_events
  add column if not exists mention_slug text;

alter table public.external_events
  add column if not exists mention_slug text;

create unique index if not exists student_organizations_mention_slug_uidx
  on public.student_organizations (lower(mention_slug))
  where mention_slug is not null and length(trim(mention_slug)) > 0;

create unique index if not exists campus_events_mention_slug_uidx
  on public.campus_events (lower(mention_slug))
  where mention_slug is not null and length(trim(mention_slug)) > 0;

create unique index if not exists external_events_mention_slug_uidx
  on public.external_events (lower(mention_slug))
  where mention_slug is not null and length(trim(mention_slug)) > 0;

-- Backfill org slugs from name (never overwrite existing).
update public.student_organizations
set mention_slug = lower(regexp_replace(regexp_replace(trim(name), '[^a-zA-Z0-9]+', '_', 'g'), '^_+|_+$', '', 'g'))
where mention_slug is null
  and name is not null
  and length(trim(name)) > 0;

update public.campus_events
set mention_slug = lower(regexp_replace(regexp_replace(trim(title), '[^a-zA-Z0-9]+', '_', 'g'), '^_+|_+$', '', 'g'))
where mention_slug is null
  and title is not null
  and length(trim(title)) > 0;

update public.external_events
set mention_slug = lower(regexp_replace(regexp_replace(trim(title), '[^a-zA-Z0-9]+', '_', 'g'), '^_+|_+$', '', 'g'))
where mention_slug is null
  and title is not null
  and length(trim(title)) > 0;

-- Tag privacy preferences (Instagram-style).
create table if not exists public.tag_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  allow_tags_from text not null default 'everyone'
    check (allow_tags_from in ('everyone', 'following', 'nobody')),
  allow_mentions_from text not null default 'everyone'
    check (allow_mentions_from in ('everyone', 'following', 'nobody')),
  manually_approve_tags boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.tag_preferences enable row level security;

drop policy if exists "Users read own tag preferences" on public.tag_preferences;
create policy "Users read own tag preferences"
  on public.tag_preferences for select
  using (auth.uid() = user_id);

drop policy if exists "Users upsert own tag preferences" on public.tag_preferences;
create policy "Users upsert own tag preferences"
  on public.tag_preferences for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Structured tags (composer + photo).
create table if not exists public.post_tags (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.quad_posts(id) on delete cascade,
  entity_type text not null check (entity_type in ('user', 'organization', 'event', 'external_event')),
  entity_id uuid not null,
  tag_source text not null check (tag_source in ('composer', 'photo', 'mention')),
  media_key text null,
  position_x numeric null check (position_x is null or (position_x >= 0 and position_x <= 1)),
  position_y numeric null check (position_y is null or (position_y >= 0 and position_y <= 1)),
  status text not null default 'approved'
    check (status in ('pending', 'approved', 'rejected', 'removed')),
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  removed_at timestamptz null,
  decided_at timestamptz null,
  decided_by uuid null references public.profiles(id) on delete set null
);

create index if not exists post_tags_post_id_idx on public.post_tags (post_id)
  where removed_at is null;
create index if not exists post_tags_entity_idx on public.post_tags (entity_type, entity_id)
  where removed_at is null and status = 'approved';
create index if not exists post_tags_pending_user_idx on public.post_tags (entity_id, status)
  where entity_type = 'user' and removed_at is null;

-- Prevent duplicate active composer/mention tags per entity on a post.
create unique index if not exists post_tags_unique_composer_entity
  on public.post_tags (post_id, entity_type, entity_id, tag_source)
  where removed_at is null and tag_source in ('composer', 'mention') and status <> 'rejected';

-- Photo tags: unique per media position slot (approx) — allow multiple tags but not exact dup entity.
create unique index if not exists post_tags_unique_photo_entity
  on public.post_tags (post_id, coalesce(media_key, 'primary'), entity_type, entity_id)
  where removed_at is null and tag_source = 'photo' and status <> 'rejected';

alter table public.post_tags enable row level security;

drop policy if exists "Authenticated read visible post tags" on public.post_tags;
create policy "Authenticated read visible post tags"
  on public.post_tags for select
  using (
    auth.uid() is not null
    and exists (
      select 1 from public.quad_posts p
      where p.id = post_id
        and (
          p.user_id = auth.uid()
          or p.visibility = 'public'
          or (
            p.visibility = 'friends'
            and exists (
              select 1 from public.student_connections c
              where c.status = 'accepted'
                and (
                  (c.requester_id = auth.uid() and c.addressee_id = p.user_id)
                  or (c.addressee_id = auth.uid() and c.requester_id = p.user_id)
                )
            )
          )
        )
    )
  );

drop policy if exists "Authors insert post tags" on public.post_tags;
create policy "Authors insert post tags"
  on public.post_tags for insert
  with check (
    auth.uid() = created_by
    and exists (
      select 1 from public.quad_posts p
      where p.id = post_id and p.user_id = auth.uid()
    )
  );

drop policy if exists "Authors update own post tags" on public.post_tags;
create policy "Authors update own post tags"
  on public.post_tags for update
  using (
    exists (select 1 from public.quad_posts p where p.id = post_id and p.user_id = auth.uid())
    or (entity_type = 'user' and entity_id = auth.uid())
  );

drop policy if exists "Authors delete own post tags" on public.post_tags;
create policy "Authors delete own post tags"
  on public.post_tags for delete
  using (
    exists (select 1 from public.quad_posts p where p.id = post_id and p.user_id = auth.uid())
    or (entity_type = 'user' and entity_id = auth.uid())
  );

-- Caption mention metadata (stable entity links + display spans).
create table if not exists public.post_mentions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.quad_posts(id) on delete cascade,
  entity_type text not null check (entity_type in ('user', 'organization', 'event', 'external_event')),
  entity_id uuid not null,
  display_text text not null,
  start_index integer not null check (start_index >= 0),
  end_index integer not null check (end_index >= start_index),
  created_at timestamptz not null default now()
);

create index if not exists post_mentions_post_id_idx on public.post_mentions (post_id);
create index if not exists post_mentions_entity_idx on public.post_mentions (entity_type, entity_id);

alter table public.post_mentions enable row level security;

drop policy if exists "Authenticated read post mentions" on public.post_mentions;
create policy "Authenticated read post mentions"
  on public.post_mentions for select
  using (
    auth.uid() is not null
    and exists (
      select 1 from public.quad_posts p
      where p.id = post_id
        and (
          p.user_id = auth.uid()
          or p.visibility = 'public'
          or (
            p.visibility = 'friends'
            and exists (
              select 1 from public.student_connections c
              where c.status = 'accepted'
                and (
                  (c.requester_id = auth.uid() and c.addressee_id = p.user_id)
                  or (c.addressee_id = auth.uid() and c.requester_id = p.user_id)
                )
            )
          )
        )
    )
  );

drop policy if exists "Authors insert post mentions" on public.post_mentions;
create policy "Authors insert post mentions"
  on public.post_mentions for insert
  with check (
    exists (
      select 1 from public.quad_posts p
      where p.id = post_id and p.user_id = auth.uid()
    )
  );

drop policy if exists "Authors delete post mentions" on public.post_mentions;
create policy "Authors delete post mentions"
  on public.post_mentions for delete
  using (
    exists (
      select 1 from public.quad_posts p
      where p.id = post_id and p.user_id = auth.uid()
    )
  );

-- Notification types for tags/mentions.
alter table public.notifications drop constraint if exists notifications_type_check;

alter table public.notifications add constraint notifications_type_check check (
  type in (
    'direct_message',
    'connection_accepted',
    'friend_request',
    'quad_post_like',
    'quad_post_comment',
    'quad_post_tag',
    'quad_post_mention',
    'quad_post_tag_approval',
    'event_rsvp_reminder',
    'organization_event_announcement',
    'moderation_safety_update',
    'organization_request_submitted',
    'organization_request_approved',
    'organization_request_denied'
  )
);
