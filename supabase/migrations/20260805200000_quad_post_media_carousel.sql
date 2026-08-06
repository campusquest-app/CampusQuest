-- Instagram-style multi-media carousel for Quad posts.
-- One quad_post_media row per slide; sort_order is zero-based.

alter table public.quad_post_media
  add column if not exists sort_order integer not null default 0;

alter table public.quad_posts
  add column if not exists media_count integer not null default 0
    check (media_count >= 0 and media_count <= 15);

alter table public.quad_posts
  add column if not exists cover_media_id uuid null;

-- Backfill media_count for existing single-media posts.
update public.quad_posts
set media_count = 1
where proof_url is not null
  and length(trim(proof_url)) > 0
  and media_count = 0;

update public.quad_posts p
set media_count = sub.cnt
from (
  select post_id, count(*)::integer as cnt
  from public.quad_post_media
  where deleted_at is null
    and post_id is not null
  group by post_id
) sub
where p.id = sub.post_id;

-- Unique sort order among active media on a post.
drop index if exists quad_post_media_post_sort_uidx;
create unique index quad_post_media_post_sort_uidx
  on public.quad_post_media (post_id, sort_order)
  where deleted_at is null and post_id is not null;

create index if not exists quad_post_media_processing_idx
  on public.quad_post_media (processing_status)
  where deleted_at is null;

-- Enforce max 15 active media items per post (server inserts also check).
create or replace function public.quad_post_media_enforce_max_items()
returns trigger
language plpgsql
as $$
declare
  active_count integer;
begin
  if new.post_id is null or new.deleted_at is not null then
    return new;
  end if;
  select count(*)::integer into active_count
  from public.quad_post_media
  where post_id = new.post_id
    and deleted_at is null
    and id is distinct from new.id;
  if tg_op = 'INSERT' or (tg_op = 'UPDATE' and (old.post_id is distinct from new.post_id or old.deleted_at is distinct from new.deleted_at)) then
    if active_count >= 15 then
      raise exception 'A Quad post can have at most 15 photos and videos.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists quad_post_media_max_items_trg on public.quad_post_media;
create trigger quad_post_media_max_items_trg
  before insert or update on public.quad_post_media
  for each row
  execute function public.quad_post_media_enforce_max_items();

-- Soft-delete media when a post is hard-deleted is handled by ON DELETE CASCADE.
-- Keep cover_media_id as a soft reference (no FK) so media soft-delete does not break posts.
