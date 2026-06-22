-- Rich DM messages: images + shared posts

alter table public.direct_messages
  add column if not exists type text not null default 'text'
    check (type in ('text', 'image', 'shared_post')),
  add column if not exists image_url text,
  add column if not exists shared_post_id uuid,
  add column if not exists shared_post_type text
    check (shared_post_type is null or shared_post_type in ('quad', 'memory')),
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists idx_direct_messages_shared_post
  on public.direct_messages(shared_post_id)
  where shared_post_id is not null;

-- Public bucket for DM images (img src in thread; upload validated server-side).
insert into storage.buckets (id, name, public)
values ('dm-images', 'dm-images', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "users upload own dm images" on storage.objects;
create policy "users upload own dm images"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'dm-images'
    and (storage.foldername(name))[2] = auth.uid()::text
  );
