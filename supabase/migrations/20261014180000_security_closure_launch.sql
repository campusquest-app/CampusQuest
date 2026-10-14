-- Launch security closure.
-- Hides gamification writes from authenticated clients and makes DM media private.
-- Does not delete user rows. Service role retains write access.

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'activities',
    'xp_logs',
    'user_stats',
    'user_quests',
    'quest_completions',
    'guilds',
    'guild_members',
    'boss_attempts',
    'boss_drops',
    'user_inventory',
    'user_beginner_quest_claims',
    'qr_scans'
  ]
  loop
    if to_regclass('public.' || tbl) is not null then
      execute format(
        'revoke insert, update, delete on table public.%I from anon, authenticated',
        tbl
      );
    end if;
  end loop;
end $$;

update storage.buckets
set public = false,
    file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
where id = 'dm-images';

update storage.buckets
set public = false,
    file_size_limit = 8388608,
    allowed_mime_types = array['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/wav']
where id = 'dm-audio';

update storage.buckets
set file_size_limit = coalesce(file_size_limit, 26214400),
    allowed_mime_types = coalesce(
      allowed_mime_types,
      array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/quicktime', 'video/webm']
    )
where id = 'quad-post-images';

-- Drop direct client upload policies for private DM buckets without naming unrelated policies.
do $$
declare
  pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and (
        policyname ilike '%dm image%'
        or policyname ilike '%dm audio%'
        or coalesce(qual, '') ilike '%dm-images%'
        or coalesce(qual, '') ilike '%dm-audio%'
        or coalesce(with_check, '') ilike '%dm-images%'
        or coalesce(with_check, '') ilike '%dm-audio%'
      )
  loop
    execute format('drop policy if exists %I on storage.objects', pol.policyname);
  end loop;
end $$;
