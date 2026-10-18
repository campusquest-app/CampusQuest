-- Purple Embers: unlimited daily allowance for exact global admin roles,
-- one Ember per post for everyone, and private totals.
--
-- Historical spark rows are not deleted or renamed. They stay in
-- quad_post_reactions.reaction_type = 'spark'. A row consumes today's
-- student allowance only when created_at is on the current America/New_York
-- day. Removing an older Ember does not restore today's allowance.
-- Removing a same-day Ember does, because the allowance counts live rows.
--
-- Unlimited Embers use profiles.role in ('admin', 'super_admin') only.
-- Organization role, business role, and client-supplied flags are not consulted.
-- The one-active-Ember unique key and the self-Ember ban apply to every role.

create or replace function public.enforce_daily_ember_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  used integer;
  day_start timestamptz;
  actor_role text;
begin
  if new.reaction_type is distinct from 'spark' then
    return new;
  end if;

  if exists (
    select 1
    from public.quad_posts
    where id = new.post_id
      and user_id = new.user_id
  ) then
    raise exception 'ember_self_not_allowed'
      using errcode = 'P0001';
  end if;

  select role into actor_role
  from public.profiles
  where id = new.user_id;

  if actor_role in ('admin', 'super_admin') then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ember:' || new.user_id::text, 0));

  day_start := date_trunc('day', timezone('America/New_York', now()))
    at time zone 'America/New_York';

  select count(*) into used
  from public.quad_post_reactions
  where user_id = new.user_id
    and reaction_type = 'spark'
    and created_at >= day_start
    and created_at < day_start + interval '1 day';

  if used >= 3 then
    raise exception 'ember_daily_limit'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_daily_ember_limit() from public;
revoke all on function public.enforce_daily_ember_limit() from anon;
revoke all on function public.enforce_daily_ember_limit() from authenticated;

comment on function public.enforce_daily_ember_limit() is
  'Students are capped at 3 Ember inserts per America/New_York day. profiles.role admin and super_admin are not capped. Nobody can Ember their own post. The unique (post_id, user_id, reaction_type) key still allows one active Ember per post.';

-- Spark rows are readable by the giver. Likes stay readable for "Liked by".
-- Post owners learn the total from the service-role count, not by listing givers.
drop policy if exists "Authenticated users read quad post reactions" on public.quad_post_reactions;
drop policy if exists "Read likes and own ember reactions" on public.quad_post_reactions;

create policy "Read likes and own ember reactions"
  on public.quad_post_reactions
  for select
  to authenticated
  using (
    reaction_type = 'like'
    or user_id = auth.uid()
  );

-- Hide the aggregate column from client roles. Service role keeps it for
-- author-only API responses and moderation tools.
revoke select (hype_count) on table public.quad_posts from public;
revoke select (hype_count) on table public.quad_posts from anon;
revoke select (hype_count) on table public.quad_posts from authenticated;

comment on column public.quad_posts.hype_count is
  'Private Ember total. Authenticated clients cannot select it. The API discloses it only to the post author.';
