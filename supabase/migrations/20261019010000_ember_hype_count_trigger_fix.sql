-- Ember inserts update quad_posts.hype_count via trigger. After
-- revoke select (hype_count) from authenticated/anon/public, environments where
-- the trigger function is not fully privileged can fail INSERT when evaluating
-- "hype_count = hype_count + 1" (UPDATE needs SELECT on the old column value).
-- Recount from reaction rows so the expression never reads hype_count.

create or replace function public.sync_quad_post_reaction_counts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  spark_total integer;
begin
  if tg_op = 'INSERT' then
    if new.reaction_type = 'spark' then
      select count(*)::integer into spark_total
      from public.quad_post_reactions
      where post_id = new.post_id
        and reaction_type = 'spark';
      update public.quad_posts
      set hype_count = coalesce(spark_total, 0)
      where id = new.post_id;
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if old.reaction_type = 'spark' then
      select count(*)::integer into spark_total
      from public.quad_post_reactions
      where post_id = old.post_id
        and reaction_type = 'spark';
      update public.quad_posts
      set hype_count = coalesce(spark_total, 0)
      where id = old.post_id;
    end if;
    return old;
  end if;
  return null;
end;
$$;

comment on function public.sync_quad_post_reaction_counts() is
  'Keeps quad_posts.hype_count aligned with spark rows without reading hype_count in an expression.';
