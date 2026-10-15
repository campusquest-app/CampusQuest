-- App Review demo content isolation.
--
-- Fictional demo profiles and the posts / events / organizations they own are
-- flagged with is_review_demo. A RESTRICTIVE select policy is ANDed with every
-- existing permissive policy, so flagged rows are invisible to every session
-- except authorized QA viewers (role 'qa' + is_test_user). Existing policies are
-- not modified. Service-role reads bypass RLS and are filtered in the API.
--
-- Safe against current production:
--   * ADD COLUMN IF NOT EXISTS ... NOT NULL DEFAULT false (PG 11+ metadata-only)
--   * DROP POLICY only of this migration's own name (idempotent re-apply)
--   * Requires public.cq_is_trusted_writer() from 20260917120000
--   * Does not DISABLE RLS, DROP TABLE, or rewrite existing policies
--
-- Rollback (demo rows must be removed or unflagged FIRST, or they become visible):
--   1. node scripts/seed-review-demo.mjs --remove --confirm
--   2. drop trigger if exists trg_protect_is_review_demo on public.profiles;
--      drop trigger if exists trg_protect_is_review_demo on public.quad_posts;
--      drop trigger if exists trg_protect_is_review_demo on public.campus_events;
--      drop trigger if exists trg_protect_is_review_demo on public.student_organizations;
--   3. drop policy if exists "review demo rows visible to qa only" on public.profiles;
--      drop policy if exists "review demo rows visible to qa only" on public.quad_posts;
--      drop policy if exists "review demo rows visible to qa only" on public.campus_events;
--      drop policy if exists "review demo rows visible to qa only" on public.student_organizations;
--   4. drop function if exists public.protect_is_review_demo();
--      drop function if exists public.cq_can_view_review_demo();
--   5. Leave is_review_demo columns in place (default false). Do not drop them
--      unless you also rewrite every dependent query.
--
-- Do not drop the restrictive policies while flagged rows remain.

do $$
begin
  if to_regprocedure('public.cq_is_trusted_writer()') is null then
    raise exception 'review_demo_isolation requires public.cq_is_trusted_writer() from 20260917120000_aud001_authorization_hardening.sql';
  end if;
  if exists (
    select 1
    from unnest(array['profiles', 'quad_posts', 'campus_events', 'student_organizations']) as t(rel)
    where not exists (
      select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = t.rel and c.relrowsecurity
    )
  ) then
    raise exception 'review_demo_isolation requires RLS already enabled on profiles, quad_posts, campus_events, and student_organizations';
  end if;
end $$;

alter table public.profiles add column if not exists is_review_demo boolean not null default false;
alter table public.quad_posts add column if not exists is_review_demo boolean not null default false;
alter table public.campus_events add column if not exists is_review_demo boolean not null default false;
alter table public.student_organizations add column if not exists is_review_demo boolean not null default false;

create index if not exists idx_profiles_is_review_demo on public.profiles (id) where is_review_demo;
create index if not exists idx_quad_posts_is_review_demo on public.quad_posts (id) where is_review_demo;
create index if not exists idx_campus_events_is_review_demo on public.campus_events (id) where is_review_demo;
create index if not exists idx_student_organizations_is_review_demo on public.student_organizations (id) where is_review_demo;

-- Caller identity comes from auth.uid() only. SECURITY DEFINER so the lookup is
-- not itself subject to the profiles policy below (no recursion). Denies on any
-- missing session / profile.
create or replace function public.cq_can_view_review_demo()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (
      select p.role = 'qa' and p.is_test_user is true and p.is_review_demo is not true
      from public.profiles p
      where p.id = auth.uid()
    ),
    false
  );
$$;

revoke all on function public.cq_can_view_review_demo() from public;
grant execute on function public.cq_can_view_review_demo() to anon, authenticated, service_role;

comment on function public.cq_can_view_review_demo() is
  'True only for authorized QA viewers (role qa + is_test_user). Gates App Review demo rows.';

drop policy if exists "review demo rows visible to qa only" on public.profiles;
create policy "review demo rows visible to qa only" on public.profiles
  as restrictive for select
  using (is_review_demo = false or (select public.cq_can_view_review_demo()));

drop policy if exists "review demo rows visible to qa only" on public.quad_posts;
create policy "review demo rows visible to qa only" on public.quad_posts
  as restrictive for select
  using (is_review_demo = false or (select public.cq_can_view_review_demo()));

drop policy if exists "review demo rows visible to qa only" on public.campus_events;
create policy "review demo rows visible to qa only" on public.campus_events
  as restrictive for select
  using (is_review_demo = false or (select public.cq_can_view_review_demo()));

drop policy if exists "review demo rows visible to qa only" on public.student_organizations;
create policy "review demo rows visible to qa only" on public.student_organizations
  as restrictive for select
  using (is_review_demo = false or (select public.cq_can_view_review_demo()));

-- Only trusted writers (service role / owner) may set or clear the flag.
-- Content inserted for a QA test account (e.g. the App Store reviewer creating
-- an event during review) is always flagged so it never reaches real students.
create or replace function public.protect_is_review_demo()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  owner_id uuid;
begin
  if tg_op = 'INSERT' and tg_table_name <> 'profiles' then
    owner_id := case tg_table_name
      when 'quad_posts' then (to_jsonb(new) ->> 'user_id')::uuid
      else (to_jsonb(new) ->> 'created_by')::uuid
    end;
    if exists (
      select 1 from public.profiles p
      where p.id = owner_id and p.role = 'qa' and p.is_test_user is true
    ) then
      new.is_review_demo := true;
      return new;
    end if;
  end if;
  if public.cq_is_trusted_writer() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.is_review_demo := false;
    return new;
  end if;
  new.is_review_demo := old.is_review_demo;
  return new;
end;
$$;

drop trigger if exists trg_protect_is_review_demo on public.profiles;
create trigger trg_protect_is_review_demo
  before insert or update of is_review_demo on public.profiles
  for each row execute function public.protect_is_review_demo();

drop trigger if exists trg_protect_is_review_demo on public.quad_posts;
create trigger trg_protect_is_review_demo
  before insert or update of is_review_demo on public.quad_posts
  for each row execute function public.protect_is_review_demo();

drop trigger if exists trg_protect_is_review_demo on public.campus_events;
create trigger trg_protect_is_review_demo
  before insert or update of is_review_demo on public.campus_events
  for each row execute function public.protect_is_review_demo();

drop trigger if exists trg_protect_is_review_demo on public.student_organizations;
create trigger trg_protect_is_review_demo
  before insert or update of is_review_demo on public.student_organizations
  for each row execute function public.protect_is_review_demo();
