-- Public storage for Quad Field Note proof images (feed img src must work without auth headers).

insert into storage.buckets (id, name, public)
values ('quad-post-images', 'quad-post-images', true)
on conflict (id) do update set public = excluded.public;
