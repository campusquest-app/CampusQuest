-- Allow authenticated users to upload into their own quad-post-images folder.

drop policy if exists "users upload own quad post images" on storage.objects;
create policy "users upload own quad post images"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'quad-post-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
