-- Anonymous Campus Feed posts: stop recording ownership in BEFORE INSERT.
--
-- The previous path inserted into quad_anonymous_authors before the post row
-- existed and relied on a deferred foreign key plus an INSERT WITH CHECK that
-- required ownership already. That combination rejected otherwise-valid
-- text-only anonymous posts (RLS / FK timing), while named posts were fine.
--
-- New path:
--   1. BEFORE INSERT keeps auth.uid() on the row so INSERT RLS can authorize.
--   2. AFTER INSERT records private ownership, then strips public identity.
-- Privacy, moderation lookup, and the private authors table stay the same.

create or replace function public.enforce_anonymous_post_privacy()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  author_id uuid;
begin
  if tg_op = 'UPDATE' then
    if new.is_anonymous is distinct from old.is_anonymous then
      raise exception 'ANONYMITY_IMMUTABLE';
    end if;
    if old.is_anonymous then
      new.user_id := null;
      new.posted_as_type := 'personal';
      new.posted_as_id := null;
      new.visibility := 'public';
      new.feed_destination := 'campus';
      new.author_streak_days := null;
      if not public.cq_is_trusted_writer() then
        new.is_review_demo := old.is_review_demo;
      end if;
    end if;
    return new;
  end if;

  if coalesce(new.is_anonymous, false) = false then
    return new;
  end if;

  author_id := coalesce(auth.uid(), new.user_id);
  if author_id is null then
    raise exception 'ANONYMOUS_AUTHOR_REQUIRED';
  end if;

  -- Keep the author on the row through INSERT RLS. AFTER INSERT records the
  -- private link and strips these fields from the public post.
  new.user_id := author_id;
  new.posted_as_type := 'personal';
  new.posted_as_id := author_id;
  new.visibility := 'public';
  new.feed_destination := 'campus';
  new.author_streak_days := null;
  return new;
end;
$$;

create or replace function public.strip_anonymous_post_identity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(new.is_anonymous, false) = false then
    return null;
  end if;
  if new.user_id is null then
    raise exception 'ANONYMOUS_AUTHOR_REQUIRED';
  end if;

  insert into public.quad_anonymous_authors (post_id, user_id)
  values (new.id, new.user_id)
  on conflict (post_id) do nothing;

  update public.quad_posts
  set
    user_id = null,
    posted_as_type = 'personal',
    posted_as_id = null,
    visibility = 'public',
    feed_destination = 'campus',
    author_streak_days = null
  where id = new.id
    and is_anonymous = true
    and user_id is not null;

  return null;
end;
$$;

drop trigger if exists trg_zz_anonymous_post_privacy on public.quad_posts;
create trigger trg_zz_anonymous_post_privacy
  before insert or update on public.quad_posts
  for each row execute function public.enforce_anonymous_post_privacy();

drop trigger if exists trg_zzz_strip_anonymous_post_identity on public.quad_posts;
create trigger trg_zzz_strip_anonymous_post_identity
  after insert on public.quad_posts
  for each row
  when (new.is_anonymous = true)
  execute function public.strip_anonymous_post_identity();

drop policy if exists "Users insert own quad posts" on public.quad_posts;
create policy "Users insert own quad posts"
  on public.quad_posts for insert
  to authenticated
  with check (
    (coalesce(is_anonymous, false) = false and auth.uid() = user_id)
    or (
      is_anonymous = true
      and auth.uid() = user_id
    )
  );
