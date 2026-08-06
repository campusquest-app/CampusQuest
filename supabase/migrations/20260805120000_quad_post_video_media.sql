-- Quad video posts: media metadata on quad_posts + optional media registry.
-- Playback uses stable storage paths/public URLs (same bucket as images for MVP parity).
-- Processing without a separate transcoder: original mobile MP4/WebM is the playback file;
-- poster thumbnails are uploaded separately.

alter table public.quad_posts
  add column if not exists media_type text not null default 'none'
    check (media_type in ('none', 'image', 'video'));

alter table public.quad_posts
  add column if not exists poster_url text;

alter table public.quad_posts
  add column if not exists media_duration_seconds numeric
    check (media_duration_seconds is null or (media_duration_seconds > 0 and media_duration_seconds <= 180));

alter table public.quad_posts
  add column if not exists media_has_audio boolean not null default false;

alter table public.quad_posts
  add column if not exists media_width integer
    check (media_width is null or media_width > 0);

alter table public.quad_posts
  add column if not exists media_height integer
    check (media_height is null or media_height > 0);

alter table public.quad_posts
  add column if not exists media_mime_type text;

alter table public.quad_posts
  add column if not exists media_file_size_bytes bigint
    check (media_file_size_bytes is null or media_file_size_bytes > 0);

alter table public.quad_posts
  add column if not exists media_processing_status text not null default 'ready'
    check (media_processing_status in ('uploading', 'processing', 'ready', 'failed'));

alter table public.quad_posts
  add column if not exists media_storage_path text;

-- Backfill existing posts that already have a proof image.
update public.quad_posts
set media_type = 'image'
where proof_url is not null
  and length(trim(proof_url)) > 0
  and media_type = 'none';

-- Allow empty caption when media is attached (image or video).
alter table public.quad_posts drop constraint if exists quad_posts_body_check;
alter table public.quad_posts
  add constraint quad_posts_body_check
  check (char_length(body) <= 300);

create table if not exists public.quad_post_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid null references public.quad_posts(id) on delete cascade,
  uploader_id uuid not null references public.profiles(id) on delete cascade,
  media_type text not null check (media_type in ('image', 'video')),
  storage_path text not null,
  playback_path text null,
  thumbnail_path text null,
  mime_type text not null,
  file_size_bytes bigint not null check (file_size_bytes > 0),
  duration_seconds numeric null check (duration_seconds is null or (duration_seconds > 0 and duration_seconds <= 180)),
  width integer null check (width is null or width > 0),
  height integer null check (height is null or height > 0),
  has_audio boolean not null default false,
  processing_status text not null default 'uploading'
    check (processing_status in ('uploading', 'processing', 'ready', 'failed')),
  processing_error text null,
  idempotency_key text null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz null
);

create unique index if not exists quad_post_media_idempotency_uidx
  on public.quad_post_media (uploader_id, idempotency_key)
  where idempotency_key is not null and deleted_at is null;

create index if not exists quad_post_media_post_id_idx
  on public.quad_post_media (post_id)
  where deleted_at is null;

create index if not exists quad_post_media_uploader_idx
  on public.quad_post_media (uploader_id, created_at desc)
  where deleted_at is null;

alter table public.quad_post_media enable row level security;

drop policy if exists "Users read visible quad media" on public.quad_post_media;
create policy "Users read visible quad media"
  on public.quad_post_media for select
  using (
    auth.uid() is not null
    and deleted_at is null
    and (
      uploader_id = auth.uid()
      or (
        post_id is not null
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
      )
    )
  );

-- Inserts/updates go through service role APIs only (no direct client writes to status/paths).
drop policy if exists "No direct client insert quad media" on public.quad_post_media;
create policy "No direct client insert quad media"
  on public.quad_post_media for insert
  with check (false);

drop policy if exists "No direct client update quad media" on public.quad_post_media;
create policy "No direct client update quad media"
  on public.quad_post_media for update
  using (false);

drop policy if exists "Authors soft-delete own draft media" on public.quad_post_media;
create policy "Authors soft-delete own draft media"
  on public.quad_post_media for delete
  using (uploader_id = auth.uid() and post_id is null);
