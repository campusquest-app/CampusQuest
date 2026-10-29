-- Anonymous Campus Feed posts.
-- The public quad_posts row does not keep the author. Ownership lives only in
-- quad_anonymous_authors, which authenticated clients cannot read.

alter table public.quad_posts
  add column if not exists is_anonymous boolean not null default false;

alter table public.quad_posts
  alter column user_id drop not null;

alter table public.quad_post_media
  alter column uploader_id drop not null;

create table if not exists public.quad_anonymous_authors (
  post_id uuid primary key references public.quad_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists quad_anonymous_authors_user_created_idx
  on public.quad_anonymous_authors (user_id, created_at desc);

alter table public.quad_anonymous_authors enable row level security;
revoke all on table public.quad_anonymous_authors from public, anon, authenticated;

create table if not exists public.anonymous_account_blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create index if not exists anonymous_account_blocks_blocker_idx
  on public.anonymous_account_blocks (blocker_id, created_at desc);

alter table public.anonymous_account_blocks enable row level security;
revoke all on table public.anonymous_account_blocks from public, anon, authenticated;

create table if not exists public.user_feature_acknowledgements (
  user_id uuid not null references public.profiles(id) on delete cascade,
  feature_key text not null,
  version integer not null check (version > 0),
  accepted_at timestamptz not null default now(),
  primary key (user_id, feature_key)
);

alter table public.user_feature_acknowledgements enable row level security;

drop policy if exists "users read own feature acknowledgements" on public.user_feature_acknowledgements;
create policy "users read own feature acknowledgements"
  on public.user_feature_acknowledgements for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "users write own feature acknowledgements" on public.user_feature_acknowledgements;
create policy "users write own feature acknowledgements"
  on public.user_feature_acknowledgements for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "users update own feature acknowledgements" on public.user_feature_acknowledgements;
create policy "users update own feature acknowledgements"
  on public.user_feature_acknowledgements for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Block checks include anonymous-account blocks without returning those ids.
create or replace function public.cq_viewer_blocked_with(p_other_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.blocked_users b
    where (b.blocker_id = auth.uid() and b.blocked_id = p_other_user_id)
       or (b.blocker_id = p_other_user_id and b.blocked_id = auth.uid())
  )
  or exists (
    select 1
    from public.anonymous_account_blocks a
    where (a.blocker_id = auth.uid() and a.blocked_id = p_other_user_id)
       or (a.blocker_id = p_other_user_id and a.blocked_id = auth.uid())
  );
$$;

revoke all on function public.cq_viewer_blocked_with(uuid) from public;
grant execute on function public.cq_viewer_blocked_with(uuid) to authenticated;

create or replace function public.cq_viewer_owns_anonymous_post(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.quad_anonymous_authors a
    where a.post_id = p_post_id
      and a.user_id = auth.uid()
  );
$$;

revoke all on function public.cq_viewer_owns_anonymous_post(uuid) from public;
grant execute on function public.cq_viewer_owns_anonymous_post(uuid) to authenticated;

create or replace function public.cq_viewer_blocked_anonymous_author(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.quad_anonymous_authors a
    where a.post_id = p_post_id
      and public.cq_viewer_blocked_with(a.user_id)
  );
$$;

revoke all on function public.cq_viewer_blocked_anonymous_author(uuid) from public;
grant execute on function public.cq_viewer_blocked_anonymous_author(uuid) to authenticated;

create or replace function public.cq_anonymous_author_is_hidden(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.quad_anonymous_authors a
    join public.profiles author on author.id = a.user_id
    where a.post_id = p_post_id
      and (
        coalesce(author.is_hidden, false)
        or coalesce(author.is_test_user, false)
        or coalesce(author.role, '') = 'qa'
      )
      and not coalesce(author.is_review_demo, false)
  );
$$;

revoke all on function public.cq_anonymous_author_is_hidden(uuid) from public;
grant execute on function public.cq_anonymous_author_is_hidden(uuid) to authenticated;

-- Runs after the posted-as and review-demo triggers so those still see the real author.
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

  insert into public.quad_anonymous_authors (post_id, user_id)
  values (new.id, author_id)
  on conflict (post_id) do nothing;

  new.user_id := null;
  new.posted_as_type := 'personal';
  new.posted_as_id := null;
  new.visibility := 'public';
  new.feed_destination := 'campus';
  new.author_streak_days := null;
  return new;
end;
$$;

drop trigger if exists trg_zz_anonymous_post_privacy on public.quad_posts;
create trigger trg_zz_anonymous_post_privacy
  before insert or update on public.quad_posts
  for each row execute function public.enforce_anonymous_post_privacy();

drop policy if exists "Users insert own quad posts" on public.quad_posts;
create policy "Users insert own quad posts"
  on public.quad_posts for insert
  to authenticated
  with check (
    (coalesce(is_anonymous, false) = false and auth.uid() = user_id)
    or (
      is_anonymous = true
      and user_id is null
      and public.cq_viewer_owns_anonymous_post(id)
    )
  );

drop policy if exists "Users update own quad posts" on public.quad_posts;
create policy "Users update own quad posts"
  on public.quad_posts for update
  to authenticated
  using (
    auth.uid() = user_id
    or public.cq_viewer_owns_anonymous_post(id)
  )
  with check (
    (coalesce(is_anonymous, false) = false and auth.uid() = user_id)
    or (
      is_anonymous = true
      and user_id is null
      and public.cq_viewer_owns_anonymous_post(id)
    )
  );

drop policy if exists "Users delete own quad posts" on public.quad_posts;
create policy "Users delete own quad posts"
  on public.quad_posts for delete
  to authenticated
  using (
    auth.uid() = user_id
    or public.cq_viewer_owns_anonymous_post(id)
  );

drop policy if exists "quad_posts select visible" on public.quad_posts;
create policy "quad_posts select visible"
on public.quad_posts for select
to authenticated
using (
  (
    quad_posts.user_id = auth.uid()
    or public.cq_viewer_owns_anonymous_post(quad_posts.id)
    or (
      (
        quad_posts.visibility = 'public'
        or (
          quad_posts.visibility = 'friends'
          and quad_posts.user_id is not null
          and exists (
            select 1
            from public.student_connections c
            where c.status = 'accepted'
              and (
                (c.requester_id = auth.uid() and c.addressee_id = quad_posts.user_id)
                or (c.addressee_id = auth.uid() and c.requester_id = quad_posts.user_id)
              )
          )
        )
      )
      and (
        quad_posts.user_id is null
        or not public.cq_viewer_blocked_with(quad_posts.user_id)
      )
      and not (
        quad_posts.is_anonymous
        and public.cq_viewer_blocked_anonymous_author(quad_posts.id)
      )
      and not exists (
        select 1
        from public.profiles author
        where author.id = quad_posts.user_id
          and (
            coalesce(author.is_hidden, false)
            or coalesce(author.is_test_user, false)
            or coalesce(author.role, '') = 'qa'
          )
      )
      and not (
        quad_posts.is_anonymous
        and public.cq_anonymous_author_is_hidden(quad_posts.id)
      )
    )
  )
);

-- Reporters must not be able to read the stored owner of a report.
revoke select (post_owner_id) on table public.quad_post_reports from authenticated, anon;

-- Anonymous block list returns no account ids.
create or replace function public.cq_my_anonymous_blocks()
returns table (id uuid, created_at timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select b.id, b.created_at
  from public.anonymous_account_blocks b
  where b.blocker_id = auth.uid()
  order by b.created_at desc;
$$;

revoke all on function public.cq_my_anonymous_blocks() from public;
grant execute on function public.cq_my_anonymous_blocks() to authenticated;

create or replace function public.cq_remove_my_anonymous_block(p_block_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  removed_id uuid;
begin
  delete from public.anonymous_account_blocks b
  where b.id = p_block_id
    and b.blocker_id = auth.uid()
  returning b.id into removed_id;
  return removed_id is not null;
end;
$$;

revoke all on function public.cq_remove_my_anonymous_block(uuid) from public;
grant execute on function public.cq_remove_my_anonymous_block(uuid) to authenticated;
