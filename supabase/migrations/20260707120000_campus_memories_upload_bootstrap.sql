-- Idempotent bootstrap for Campus Memory image uploads.
-- Memory photos upload to the shared quad-post-images bucket via the service role;
-- this migration ensures the bucket and authenticated insert policy exist even if
-- an environment applied campus_memories before the older quad-post image migrations.

insert into storage.buckets (id, name, public)
values ('quad-post-images', 'quad-post-images', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "users upload own quad post images" on storage.objects;
create policy "users upload own quad post images"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'quad-post-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Public read so Memory/Quad image URLs work without auth headers (public bucket).
drop policy if exists "public read quad post images" on storage.objects;
create policy "public read quad post images"
  on storage.objects for select
  to public
  using (bucket_id = 'quad-post-images');

comment on table public.campus_memories is
  'Temporary campus moments tied to location; default 24h visibility. Images stored in quad-post-images bucket.';
