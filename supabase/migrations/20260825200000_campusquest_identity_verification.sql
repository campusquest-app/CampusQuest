-- CampusQuest one-login identities + business/organization verification.
-- Reuses profiles (personal), student_businesses, student_organizations,
-- student_business_members, and organization_members. Idempotent.

-- ---------------------------------------------------------------------------
-- Active identity persistence
-- ---------------------------------------------------------------------------

create table if not exists public.user_active_identities (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  identity_type text not null check (identity_type in ('personal', 'student_business', 'organization')),
  identity_id uuid not null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_active_identities_type
  on public.user_active_identities (identity_type, identity_id);

alter table public.user_active_identities enable row level security;

drop policy if exists "user_active_identities own" on public.user_active_identities;
create policy "user_active_identities own"
on public.user_active_identities for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop trigger if exists trg_user_active_identities_updated_at on public.user_active_identities;
create trigger trg_user_active_identities_updated_at
before update on public.user_active_identities
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Verification applications
-- ---------------------------------------------------------------------------

create table if not exists public.verification_requests (
  id uuid primary key default gen_random_uuid(),
  applicant_user_id uuid not null references public.profiles(id) on delete cascade,
  identity_type text not null check (identity_type in ('student_business', 'organization')),
  requested_identity_id uuid,
  name text not null check (char_length(trim(name)) between 2 and 120),
  category text not null check (char_length(trim(category)) between 2 and 80),
  description text not null default '' check (char_length(description) <= 2000),
  website_url text check (website_url is null or char_length(trim(website_url)) <= 2048),
  social_url text check (social_url is null or char_length(trim(social_url)) <= 2048),
  organization_email text check (organization_email is null or char_length(trim(organization_email)) <= 180),
  urinvolved_url text check (urinvolved_url is null or char_length(trim(urinvolved_url)) <= 2048),
  applicant_role text check (applicant_role is null or char_length(trim(applicant_role)) <= 80),
  logo_url text check (logo_url is null or char_length(trim(logo_url)) <= 2048),
  image_url text check (image_url is null or char_length(trim(image_url)) <= 2048),
  reason_for_access text check (reason_for_access is null or char_length(trim(reason_for_access)) <= 1000),
  applicant_confirmation boolean not null default false,
  status text not null default 'pending_review' check (
    status in ('draft', 'pending_review', 'needs_info', 'approved', 'rejected')
  ),
  admin_internal_notes text check (admin_internal_notes is null or char_length(admin_internal_notes) <= 2000),
  applicant_status_message text check (applicant_status_message is null or char_length(applicant_status_message) <= 1000),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_verification_requests_status
  on public.verification_requests (status, created_at desc);
create index if not exists idx_verification_requests_applicant
  on public.verification_requests (applicant_user_id, created_at desc);

create unique index if not exists uniq_verification_pending_name
  on public.verification_requests (applicant_user_id, identity_type, lower(trim(name)))
  where status in ('draft', 'pending_review', 'needs_info');

drop trigger if exists trg_verification_requests_updated_at on public.verification_requests;
create trigger trg_verification_requests_updated_at
before update on public.verification_requests
for each row execute function public.set_updated_at();

create table if not exists public.verification_request_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.verification_requests(id) on delete cascade,
  actor_user_id uuid references public.profiles(id) on delete set null,
  previous_status text,
  new_status text not null,
  internal_notes text,
  applicant_message text,
  created_at timestamptz not null default now()
);

create index if not exists idx_verification_request_events_request
  on public.verification_request_events (request_id, created_at desc);

alter table public.verification_requests enable row level security;
alter table public.verification_request_events enable row level security;

drop policy if exists "verification_requests select own" on public.verification_requests;
create policy "verification_requests select own"
on public.verification_requests for select
to authenticated
using (applicant_user_id = auth.uid());

drop policy if exists "verification_requests insert own" on public.verification_requests;
create policy "verification_requests insert own"
on public.verification_requests for insert
to authenticated
with check (
  applicant_user_id = auth.uid()
  and status in ('draft', 'pending_review')
  and applicant_confirmation = true
  and reviewed_by is null
  and reviewed_at is null
  and admin_internal_notes is null
);

drop policy if exists "verification_requests update own open" on public.verification_requests;
create policy "verification_requests update own open"
on public.verification_requests for update
to authenticated
using (
  applicant_user_id = auth.uid()
  and status in ('draft', 'needs_info')
)
with check (
  applicant_user_id = auth.uid()
  and status in ('draft', 'pending_review', 'needs_info')
  and reviewed_by is null
);

-- Students must not read or write admin audit rows.
drop policy if exists "verification_request_events deny students" on public.verification_request_events;
create policy "verification_request_events deny students"
on public.verification_request_events for all
to authenticated
using (false)
with check (false);

create or replace function public.prevent_verification_self_approve()
returns trigger
language plpgsql
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.applicant_user_id := auth.uid();
    if new.status is null or new.status not in ('draft', 'pending_review') then
      new.status := 'pending_review';
    end if;
    if new.status = 'pending_review' then
      new.submitted_at := coalesce(new.submitted_at, now());
    end if;
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.admin_internal_notes := null;
    if new.status in ('approved', 'rejected') then
      raise exception 'Students cannot approve verification requests';
    end if;
    return new;
  end if;

  new.applicant_user_id := old.applicant_user_id;
  new.reviewed_by := old.reviewed_by;
  new.reviewed_at := old.reviewed_at;
  new.admin_internal_notes := old.admin_internal_notes;
  new.requested_identity_id := old.requested_identity_id;

  if old.status in ('pending_review', 'approved', 'rejected') then
    raise exception 'This verification request can no longer be edited';
  end if;

  if new.status in ('approved', 'rejected') then
    raise exception 'Students cannot approve or reject verification requests';
  end if;

  if old.status = 'needs_info' and new.status not in ('needs_info', 'pending_review', 'draft') then
    raise exception 'Invalid verification status transition';
  end if;

  if new.status = 'pending_review' then
    new.submitted_at := coalesce(new.submitted_at, now());
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prevent_verification_self_approve on public.verification_requests;
create trigger trg_prevent_verification_self_approve
before insert or update on public.verification_requests
for each row execute function public.prevent_verification_self_approve();

create or replace function public.enforce_user_active_identity()
returns trigger
language plpgsql
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;

  new.user_id := auth.uid();

  if new.identity_type = 'personal' then
    new.identity_id := auth.uid();
    return new;
  end if;

  if new.identity_type = 'student_business' then
    if not exists (
      select 1
      from public.student_business_members m
      join public.student_businesses b on b.id = m.business_id
      where m.business_id = new.identity_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
        and b.verification_status = 'verified'
        and b.status = 'active'
    ) then
      raise exception 'You can only switch to a verified business you manage';
    end if;
    return new;
  end if;

  if new.identity_type = 'organization' then
    if not exists (
      select 1
      from public.organization_members m
      join public.student_organizations o on o.id = m.organization_id
      where m.organization_id = new.identity_id
        and m.user_id = auth.uid()
        and coalesce(m.status, 'approved') = 'approved'
        and (
          coalesce(m.org_role, '') in ('owner', 'admin')
          or coalesce(m.role, '') in ('manager', 'owner', 'admin')
        )
        and o.is_approved = true
    ) then
      raise exception 'You can only switch to an organization you manage';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_user_active_identity on public.user_active_identities;
create trigger trg_enforce_user_active_identity
before insert or update on public.user_active_identities
for each row execute function public.enforce_user_active_identity();

-- Equivalent of identity_managers: union of existing membership tables.
create or replace view public.identity_managers as
select
  b.id as identity_id,
  'student_business'::text as identity_type,
  m.user_id,
  m.role,
  m.created_at
from public.student_business_members m
join public.student_businesses b on b.id = m.business_id
union all
select
  o.id as identity_id,
  'organization'::text as identity_type,
  m.user_id,
  case
    when coalesce(m.org_role, '') in ('owner', 'admin') then m.org_role
    when coalesce(m.role, '') = 'manager' then 'manager'
    else coalesce(nullif(m.org_role, ''), 'manager')
  end as role,
  m.created_at
from public.organization_members m
join public.student_organizations o on o.id = m.organization_id
where coalesce(m.status, 'approved') = 'approved'
  and (
    coalesce(m.org_role, '') in ('owner', 'admin')
    or coalesce(m.role, '') in ('manager', 'owner', 'admin')
  );

-- ---------------------------------------------------------------------------
-- Business verification + Market campus-feed targeting
-- ---------------------------------------------------------------------------

alter table public.student_businesses
  add column if not exists verified_at timestamptz;

alter table public.marketplace_listings
  add column if not exists show_in_campus_feed boolean not null default true;

create index if not exists idx_marketplace_listings_campus_feed
  on public.marketplace_listings (show_in_campus_feed, status, created_at desc)
  where show_in_campus_feed = true and status = 'active';

create or replace function public.prevent_marketplace_verification_spoof()
returns trigger
language plpgsql
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.verification_status := 'unverified';
    new.plan_tier := 'free';
    new.verified_at := null;
    return new;
  end if;
  new.verification_status := old.verification_status;
  new.plan_tier := old.plan_tier;
  new.verified_at := old.verified_at;
  return new;
end;
$$;

create or replace function public.is_verified_student_business_manager(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.student_business_members m
    join public.student_businesses b on b.id = m.business_id
    where m.business_id = p_business_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'admin')
      and b.verification_status = 'verified'
      and b.status = 'active'
  );
$$;

revoke all on function public.is_verified_student_business_manager(uuid) from public;
grant execute on function public.is_verified_student_business_manager(uuid) to authenticated;

create or replace function public.enforce_marketplace_listing_identity()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if coalesce(auth.role(), '') <> 'service_role' then
      new.seller_id := auth.uid();
    end if;
    new.featured_until := null;
    new.favorite_count := 0;
    new.status := 'active';
    new.show_in_campus_feed := true;

    if new.listing_kind = 'item' then
      new.business_id := null;
    elsif new.listing_kind in ('service', 'business_post') then
      if new.business_id is null or not public.is_verified_student_business_manager(new.business_id) then
        raise exception 'MARKETPLACE_VERIFIED_BUSINESS_REQUIRED';
      end if;
    end if;
    return new;
  end if;

  new.seller_id := old.seller_id;
  new.featured_until := old.featured_until;
  new.show_in_campus_feed := old.show_in_campus_feed;
  if new.listing_kind = 'item' then
    new.business_id := null;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Quad posting identity (never trust client posted_as without validation)
-- ---------------------------------------------------------------------------

alter table public.quad_posts
  add column if not exists posted_as_type text not null default 'personal';

alter table public.quad_posts
  add column if not exists posted_as_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'quad_posts_posted_as_type_check'
  ) then
    alter table public.quad_posts
      add constraint quad_posts_posted_as_type_check
      check (posted_as_type in ('personal', 'student_business', 'organization'));
  end if;
end $$;

create index if not exists idx_quad_posts_posted_as
  on public.quad_posts (posted_as_type, posted_as_id, created_at desc);

create or replace function public.enforce_quad_post_posted_as()
returns trigger
language plpgsql
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' then
    if new.posted_as_type is null then
      new.posted_as_type := 'personal';
    end if;
    if new.posted_as_id is null then
      new.posted_as_id := new.user_id;
    end if;
    return new;
  end if;

  new.user_id := coalesce(auth.uid(), new.user_id);

  if new.posted_as_type is null or new.posted_as_type = 'personal' then
    new.posted_as_type := 'personal';
    new.posted_as_id := new.user_id;
    return new;
  end if;

  if new.posted_as_type = 'student_business' then
    if not public.is_verified_student_business_manager(new.posted_as_id) then
      raise exception 'POSTED_AS_FORBIDDEN';
    end if;
    return new;
  end if;

  if new.posted_as_type = 'organization' then
    if not exists (
      select 1
      from public.organization_members m
      join public.student_organizations o on o.id = m.organization_id
      where m.organization_id = new.posted_as_id
        and m.user_id = auth.uid()
        and coalesce(m.status, 'approved') = 'approved'
        and (
          coalesce(m.org_role, '') in ('owner', 'admin')
          or coalesce(m.role, '') in ('manager', 'owner', 'admin')
        )
        and o.is_approved = true
    ) then
      raise exception 'POSTED_AS_FORBIDDEN';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_quad_post_posted_as on public.quad_posts;
create trigger trg_enforce_quad_post_posted_as
before insert or update of posted_as_type, posted_as_id, user_id on public.quad_posts
for each row execute function public.enforce_quad_post_posted_as();

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (
  type in (
    'direct_message',
    'connection_accepted',
    'friend_request',
    'quad_post_like',
    'quad_post_comment',
    'quad_post_tag',
    'quad_post_mention',
    'quad_post_tag_approval',
    'event_rsvp_reminder',
    'organization_event_announcement',
    'moderation_safety_update',
    'organization_request_submitted',
    'organization_request_approved',
    'organization_request_denied',
    'marketplace_offer',
    'marketplace_offer_accepted',
    'marketplace_offer_declined',
    'verification_request_submitted',
    'verification_request_approved',
    'verification_request_needs_info',
    'verification_request_rejected'
  )
);

comment on table public.verification_requests is
  'Student Business and organization verification applications. Students cannot self-approve.';
comment on table public.user_active_identities is
  'Persisted active posting/profile identity for one login with multiple identities.';
comment on view public.identity_managers is
  'Managers of business and organization identities. Backed by student_business_members and organization_members.';
