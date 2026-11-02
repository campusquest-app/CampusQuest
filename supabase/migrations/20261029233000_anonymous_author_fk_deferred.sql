-- The privacy trigger records the owner before the public post row is visible.
-- An immediate foreign key rejects that insert, so anonymous posts never land.
-- Defer the check until commit, after the post row exists. The cascade and the
-- private-author table stay the same.

alter table public.quad_anonymous_authors
  alter constraint quad_anonymous_authors_post_id_fkey deferrable initially deferred;
