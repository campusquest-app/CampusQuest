-- Protect profile fields that the HTTP API treats as friends/self-only.
-- Postgres RLS is row-level, so private columns move to profile_private for
-- authenticated reads. profiles keeps a synced copy for service-role/admin.

create or replace function public.cq_are_accepted_connections(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.student_connections
    where status = 'accepted'
      and (
        (requester_id = p_a and addressee_id = p_b)
        or (requester_id = p_b and addressee_id = p_a)
      )
  );
$$;

revoke all on function public.cq_are_accepted_connections(uuid, uuid) from public;
grant execute on function public.cq_are_accepted_connections(uuid, uuid) to authenticated;

create table if not exists public.profile_private (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  bio text,
  major text,
  class_year integer,
  academic_area text,
  requested_school_name text,
  student_status text,
  updated_at timestamptz not null default now()
);

alter table public.profile_private enable row level security;

insert into public.profile_private (
  user_id, bio, major, class_year, academic_area, requested_school_name, student_status
)
select
  p.id,
  p.bio,
  p.major,
  p.class_year,
  p.academic_area,
  p.requested_school_name,
  p.student_status
from public.profiles p
on conflict (user_id) do update
set
  bio = excluded.bio,
  major = excluded.major,
  class_year = excluded.class_year,
  academic_area = excluded.academic_area,
  requested_school_name = excluded.requested_school_name,
  student_status = excluded.student_status,
  updated_at = now();

create or replace function public.cq_sync_profile_private()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profile_private (
    user_id, bio, major, class_year, academic_area, requested_school_name, student_status, updated_at
  )
  values (
    new.id,
    new.bio,
    new.major,
    new.class_year,
    new.academic_area,
    new.requested_school_name,
    new.student_status,
    now()
  )
  on conflict (user_id) do update
  set
    bio = excluded.bio,
    major = excluded.major,
    class_year = excluded.class_year,
    academic_area = excluded.academic_area,
    requested_school_name = excluded.requested_school_name,
    student_status = excluded.student_status,
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_sync_profile_private on public.profiles;
create trigger trg_sync_profile_private
after insert or update of bio, major, class_year, academic_area, requested_school_name, student_status
on public.profiles
for each row
execute function public.cq_sync_profile_private();

drop policy if exists "profile_private select owner or connected" on public.profile_private;
create policy "profile_private select owner or connected"
on public.profile_private for select
to authenticated
using (
  auth.uid() = user_id
  or public.cq_are_accepted_connections(auth.uid(), user_id)
);

drop policy if exists "profile_private write owner" on public.profile_private;
create policy "profile_private write owner"
on public.profile_private for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

revoke all on public.profile_private from anon;
grant select, insert, update, delete on public.profile_private to authenticated;

-- Authenticated clients may still discover public profile cards, but cannot
-- SELECT friends-only columns from the monolithic profiles table.
revoke select (bio, major, class_year, academic_area, requested_school_name, student_status)
  on public.profiles from anon, authenticated, public;

-- Service-role / server routes still need the synced copy for owner APIs,
-- admin tools, and analytics. REVOKE FROM PUBLIC must not strand them.
grant select (bio, major, class_year, academic_area, requested_school_name, student_status)
  on public.profiles to service_role;
