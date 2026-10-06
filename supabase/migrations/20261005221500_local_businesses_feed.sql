-- Local Businesses quad posts.
-- Viewing is open to every signed-in student (existing public quad_posts SELECT).
-- Creating or moving a post into this feed requires a verified student business
-- the caller manages. Reuses public.is_verified_student_business_manager.

alter table public.quad_posts
  add column if not exists feed_destination text not null default 'campus';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'quad_posts_feed_destination_check'
  ) then
    alter table public.quad_posts
      add constraint quad_posts_feed_destination_check
      check (feed_destination in ('campus', 'local_businesses'));
  end if;
end $$;

create index if not exists idx_quad_posts_feed_destination_created
  on public.quad_posts (feed_destination, created_at desc);

create or replace function public.enforce_local_business_feed_post()
returns trigger
language plpgsql
as $$
begin
  if new.feed_destination is null or new.feed_destination = 'campus' then
    new.feed_destination := 'campus';
    return new;
  end if;

  if new.feed_destination is distinct from 'local_businesses' then
    raise exception 'LOCAL_BUSINESS_FEED_FORBIDDEN';
  end if;

  if new.posted_as_type is distinct from 'student_business'
     or not public.is_verified_student_business_manager(new.posted_as_id) then
    raise exception 'LOCAL_BUSINESS_FEED_FORBIDDEN';
  end if;

  -- These posts are a public community feed, not a friends-only post.
  new.visibility := 'public';
  return new;
end;
$$;

drop trigger if exists trg_enforce_local_business_feed on public.quad_posts;
create trigger trg_enforce_local_business_feed
before insert or update of feed_destination, posted_as_type, posted_as_id
on public.quad_posts
for each row execute function public.enforce_local_business_feed_post();
