-- Admin-approved organization creation workflow (students submit requests).
-- Idempotent: `create table/index if not exists`, `drop policy/trigger if exists`, `create or replace function`.

create table if not exists public.organization_creation_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  school_name text not null check (char_length(trim(school_name)) between 2 and 120),
  school_domain text not null check (char_length(trim(school_domain)) between 2 and 120),
  requested_name text not null check (char_length(trim(requested_name)) between 2 and 120),
  requested_category text not null check (char_length(trim(requested_category)) between 2 and 80),
  contact_link text check (contact_link is null or char_length(trim(contact_link)) <= 2048),
  logo_url text check (logo_url is null or char_length(trim(logo_url)) <= 2048),
  description text not null default '' check (char_length(description) <= 2000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  admin_reason text check (admin_reason is null or char_length(admin_reason) <= 1000),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_organization_id uuid references public.student_organizations(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_org_creation_requests_status_created
  on public.organization_creation_requests(status, created_at desc);

create index if not exists idx_org_creation_requests_requester
  on public.organization_creation_requests(requester_id, created_at desc);

create unique index if not exists uniq_org_creation_pending_name_school
  on public.organization_creation_requests (lower(trim(requested_name)), lower(trim(school_domain)))
  where status = 'pending';

drop trigger if exists trg_organization_creation_requests_updated_at on public.organization_creation_requests;
create trigger trg_organization_creation_requests_updated_at
before update on public.organization_creation_requests
for each row execute function public.set_updated_at();

alter table public.organization_creation_requests enable row level security;

drop policy if exists "organization_creation_requests select own" on public.organization_creation_requests;
create policy "organization_creation_requests select own"
on public.organization_creation_requests for select
to authenticated
using (requester_id = auth.uid());

drop policy if exists "organization_creation_requests insert own" on public.organization_creation_requests;
create policy "organization_creation_requests insert own"
on public.organization_creation_requests for insert
to authenticated
with check (requester_id = auth.uid());

drop policy if exists "student_organizations create own" on public.student_organizations;

-- Notifications: extend allowed type values (replace prior type check constraint).
do $$
declare
  r record;
begin
  for r in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'notifications'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) like '%direct_message%'
  loop
    execute format('alter table public.notifications drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.notifications add constraint notifications_type_check check (
  type in (
    'direct_message',
    'connection_accepted',
    'event_rsvp_reminder',
    'organization_event_announcement',
    'moderation_safety_update',
    'organization_request_submitted',
    'organization_request_approved',
    'organization_request_denied'
  )
);

-- Atomic approve: create organization + owner row + finalize request (service role only).
create or replace function public.approve_organization_creation_request(
  p_request_id uuid,
  p_reviewer_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.organization_creation_requests%rowtype;
  v_org_id uuid;
begin
  select *
  into r
  from public.organization_creation_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'ORG_REQUEST_NOT_FOUND' using errcode = 'P0001';
  end if;

  if r.status <> 'pending' then
    raise exception 'ORG_REQUEST_NOT_PENDING' using errcode = 'P0001';
  end if;

  insert into public.student_organizations (
    name,
    description,
    category,
    logo_url,
    school_name,
    school_domain,
    contact_link,
    created_by,
    is_approved
  ) values (
    trim(r.requested_name),
    r.description,
    trim(r.requested_category),
    nullif(trim(r.logo_url), ''),
    trim(r.school_name),
    lower(trim(r.school_domain)),
    nullif(trim(r.contact_link), ''),
    r.requester_id,
    true
  )
  returning id into v_org_id;

  insert into public.organization_members (
    organization_id,
    user_id,
    role,
    org_role,
    membership_kind,
    status
  ) values (
    v_org_id,
    r.requester_id,
    'manager',
    'owner',
    'member',
    'approved'
  );

  update public.organization_creation_requests
  set
    status = 'approved',
    reviewed_by = p_reviewer_id,
    reviewed_at = now(),
    created_organization_id = v_org_id,
    updated_at = now()
  where id = p_request_id;

  return v_org_id;
end;
$$;

revoke all on function public.approve_organization_creation_request(uuid, uuid) from public;
grant execute on function public.approve_organization_creation_request(uuid, uuid) to service_role;
