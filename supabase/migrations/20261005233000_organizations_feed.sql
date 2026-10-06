-- Organizations quad posts.
-- Viewing stays open through the existing public quad_posts SELECT policy.
-- Creating or moving a post into this feed requires the caller to represent an
-- approved organization. This is the same relationship already enforced by
-- public.enforce_quad_post_posted_as (approved membership, owner/admin or
-- legacy manager role, organization is_approved).

alter table public.quad_posts
  add column if not exists feed_destination text not null default 'campus';

alter table public.quad_posts drop constraint if exists quad_posts_feed_destination_check;
alter table public.quad_posts
  add constraint quad_posts_feed_destination_check
  check (feed_destination in ('campus', 'local_businesses', 'organizations'));

create or replace function public.is_approved_organization_representative(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members m
    join public.student_organizations o on o.id = m.organization_id
    where m.organization_id = p_organization_id
      and m.user_id = auth.uid()
      and coalesce(m.status, 'approved') = 'approved'
      and (
        coalesce(m.org_role, '') in ('owner', 'admin')
        or coalesce(m.role, '') in ('manager', 'owner', 'admin')
      )
      and o.is_approved = true
  );
$$;

revoke all on function public.is_approved_organization_representative(uuid) from public;
grant execute on function public.is_approved_organization_representative(uuid) to authenticated;

create or replace function public.enforce_local_business_feed_post()
returns trigger
language plpgsql
as $$
begin
  if new.feed_destination is null or new.feed_destination = 'campus' then
    new.feed_destination := 'campus';
    return new;
  end if;

  if new.feed_destination = 'local_businesses' then
    if new.posted_as_type is distinct from 'student_business'
       or not public.is_verified_student_business_manager(new.posted_as_id) then
      raise exception 'LOCAL_BUSINESS_FEED_FORBIDDEN';
    end if;
    new.visibility := 'public';
    return new;
  end if;

  if new.feed_destination = 'organizations' then
    if new.posted_as_type is distinct from 'organization'
       or not public.is_approved_organization_representative(new.posted_as_id) then
      raise exception 'ORGANIZATION_FEED_FORBIDDEN';
    end if;
    new.visibility := 'public';
    return new;
  end if;

  raise exception 'LOCAL_BUSINESS_FEED_FORBIDDEN';
end;
$$;

drop policy if exists "Approved org reps update organization posts" on public.quad_posts;
create policy "Approved org reps update organization posts"
on public.quad_posts for update
to authenticated
using (
  feed_destination = 'organizations'
  and posted_as_type = 'organization'
  and public.is_approved_organization_representative(posted_as_id)
)
with check (
  feed_destination = 'organizations'
  and posted_as_type = 'organization'
  and public.is_approved_organization_representative(posted_as_id)
);

drop policy if exists "Approved org reps delete organization posts" on public.quad_posts;
create policy "Approved org reps delete organization posts"
on public.quad_posts for delete
to authenticated
using (
  feed_destination = 'organizations'
  and posted_as_type = 'organization'
  and public.is_approved_organization_representative(posted_as_id)
);
