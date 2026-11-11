-- Local business accounts.
-- Extends profiles.role. Does not create users, listings, or posts.
-- Daisy's and the other Student Perks stay in the partner directory.
-- Owner edits live in partner_profile_overrides and are merged at read time.

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (
    role is null
    or role in (
      'student',
      'faculty_staff',
      'admin',
      'super_admin',
      'qa',
      'beta_internal',
      'local_business'
    )
  );

create table if not exists public.local_business_accounts (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  must_reset_password boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One login can manage many listings, and one listing can have many managers.
-- Access is this row, never a username or email.
create table if not exists public.local_business_memberships (
  user_id uuid not null references public.profiles(id) on delete cascade,
  partner_id text not null check (partner_id ~ '^[a-z0-9-]{1,80}$'),
  approved boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, partner_id)
);

create index if not exists local_business_memberships_partner
  on public.local_business_memberships (partner_id)
  where revoked_at is null;

alter table public.local_business_accounts enable row level security;

drop policy if exists "local_business_accounts read own" on public.local_business_accounts;
create policy "local_business_accounts read own"
  on public.local_business_accounts for select
  to authenticated
  using (user_id = auth.uid());

revoke all on table public.local_business_accounts from public;
revoke all on table public.local_business_accounts from anon;
revoke all on table public.local_business_accounts from authenticated;
grant select on table public.local_business_accounts to authenticated;

alter table public.local_business_memberships enable row level security;

drop policy if exists "local_business_memberships read own" on public.local_business_memberships;
create policy "local_business_memberships read own"
  on public.local_business_memberships for select
  to authenticated
  using (user_id = auth.uid());

revoke all on table public.local_business_memberships from public;
revoke all on table public.local_business_memberships from anon;
revoke all on table public.local_business_memberships from authenticated;
grant select on table public.local_business_memberships to authenticated;

create table if not exists public.partner_profile_overrides (
  partner_id text primary key check (partner_id ~ '^[a-z0-9-]{1,80}$'),
  username text check (username is null or username ~ '^[a-z0-9_]{3,24}$'),
  description text check (description is null or char_length(description) <= 500),
  website_url text check (website_url is null or char_length(website_url) <= 300),
  contact_email text check (contact_email is null or char_length(contact_email) <= 160),
  contact_phone text check (contact_phone is null or char_length(contact_phone) <= 40),
  hours jsonb,
  logo_url text check (logo_url is null or char_length(logo_url) <= 500),
  cover_image_url text check (cover_image_url is null or char_length(cover_image_url) <= 500),
  photos jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create unique index if not exists partner_profile_overrides_username
  on public.partner_profile_overrides (username)
  where username is not null;

alter table public.partner_profile_overrides enable row level security;

drop policy if exists "partner_profile_overrides read" on public.partner_profile_overrides;
create policy "partner_profile_overrides read"
  on public.partner_profile_overrides for select
  to authenticated
  using (true);

drop policy if exists "partner_profile_overrides write own" on public.partner_profile_overrides;
create policy "partner_profile_overrides write own"
  on public.partner_profile_overrides for all
  to authenticated
  using (
    exists (
      select 1
      from public.local_business_memberships m
      join public.local_business_accounts a on a.user_id = m.user_id
      join public.profiles p on p.id = m.user_id
      where m.user_id = auth.uid()
        and m.partner_id = partner_profile_overrides.partner_id
        and m.revoked_at is null
        and m.approved = true
        and a.revoked_at is null
        and p.role = 'local_business'
    )
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'super_admin')
    )
  )
  with check (
    exists (
      select 1
      from public.local_business_memberships m
      join public.local_business_accounts a on a.user_id = m.user_id
      join public.profiles p on p.id = m.user_id
      where m.user_id = auth.uid()
        and m.partner_id = partner_profile_overrides.partner_id
        and m.revoked_at is null
        and m.approved = true
        and a.revoked_at is null
        and p.role = 'local_business'
    )
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'super_admin')
    )
  );

revoke all on table public.partner_profile_overrides from public;
revoke all on table public.partner_profile_overrides from anon;
grant select, insert, update, delete on table public.partner_profile_overrides to authenticated;

alter table public.quad_posts
  add column if not exists business_partner_id text
  check (business_partner_id is null or business_partner_id ~ '^[a-z0-9-]{1,80}$');

create index if not exists quad_posts_business_partner
  on public.quad_posts (business_partner_id)
  where business_partner_id is not null;

-- Local business accounts only see Local Businesses posts, including through direct Supabase reads.
drop policy if exists "quad_posts_hide_student_feeds_from_local_businesses" on public.quad_posts;
create policy "quad_posts_hide_student_feeds_from_local_businesses"
  on public.quad_posts
  as restrictive
  for select
  to authenticated
  using (
    feed_destination = 'local_businesses'
    or not exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'local_business'
    )
  );

create or replace function public.enforce_local_business_feed_post()
returns trigger
language plpgsql
as $$
declare
  actor uuid := auth.uid();
  actor_role text;
  business_ok boolean := false;
begin
  if actor is null then
    return new;
  end if;

  select p.role into actor_role
  from public.profiles p
  where p.id = actor;

  if tg_op = 'UPDATE'
     and old.business_partner_id is not null
     and new.business_partner_id is distinct from old.business_partner_id then
    raise exception 'LOCAL_BUSINESS_FEED_FORBIDDEN';
  end if;

  if actor_role = 'local_business' then
    if new.feed_destination is distinct from 'local_businesses' then
      raise exception 'STUDENT_FEED_POST_FORBIDDEN';
    end if;
    select exists (
      select 1
      from public.local_business_memberships m
      join public.local_business_accounts a on a.user_id = m.user_id
      where m.user_id = actor
        and m.partner_id = new.business_partner_id
        and m.revoked_at is null
        and m.approved = true
        and a.revoked_at is null
    ) into business_ok;
    if not business_ok then
      raise exception 'LOCAL_BUSINESS_FEED_FORBIDDEN';
    end if;
    if tg_op = 'INSERT' then
      new.user_id := actor;
    end if;
    new.posted_as_type := 'personal';
    new.posted_as_id := actor;
    new.feed_destination := 'local_businesses';
    new.visibility := 'public';
    new.is_anonymous := false;
    return new;
  end if;

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

drop trigger if exists trg_enforce_local_business_feed on public.quad_posts;
create trigger trg_enforce_local_business_feed
before insert or update of feed_destination, posted_as_type, posted_as_id, business_partner_id
on public.quad_posts
for each row execute function public.enforce_local_business_feed_post();
