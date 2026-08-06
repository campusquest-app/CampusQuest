-- Ensure quad-post-images bucket exists and authenticated users can only
-- insert under their own userId folder. Public read remains for feed img/src.
-- Uploads used by the API go through the service role (bypasses RLS), but
-- client-side policies must stay least-privilege.

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

drop policy if exists "users update own quad post images" on storage.objects;
create policy "users update own quad post images"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'quad-post-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'quad-post-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "public read quad post images" on storage.objects;
create policy "public read quad post images"
  on storage.objects for select
  to public
  using (bucket_id = 'quad-post-images');
