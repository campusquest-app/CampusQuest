-- DM voice messages: extend type enum + audio storage bucket

alter table public.direct_messages
  drop constraint if exists direct_messages_type_check;

alter table public.direct_messages
  add constraint direct_messages_type_check
  check (type in ('text', 'image', 'shared_post', 'audio'));

insert into storage.buckets (id, name, public)
values ('dm-audio', 'dm-audio', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "users upload own dm audio" on storage.objects;
create policy "users upload own dm audio"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'dm-audio'
    and (storage.foldername(name))[2] = auth.uid()::text
  );
