-- Organization management portal: roles, join requests, announcements, and moderation controls.

alter table public.organization_members
  add column if not exists org_role text not null default 'member' check (org_role in ('owner', 'admin', 'member'));

alter table public.organization_members
  add column if not exists membership_kind text not null default 'member' check (membership_kind in ('member', 'follower'));

alter table public.organization_members
  add column if not exists status text not null default 'approved' check (status in ('pending', 'approved', 'denied'));

alter table public.student_organizations
  add column if not exists require_join_approval boolean not null default false;

alter table public.student_organizations
  add column if not exists is_frozen boolean not null default false;

alter table public.student_organizations
  add column if not exists frozen_reason text;

alter table public.student_organizations
  add column if not exists frozen_by uuid references public.profiles(id) on delete set null;

alter table public.student_organizations
  add column if not exists frozen_at timestamptz;

create table if not exists public.organization_join_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.student_organizations(id) on delete cascade,
  requester_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, requester_id)
);

create table if not exists public.organization_announcements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.student_organizations(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 3 and 180),
  message text not null check (char_length(message) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_org_members_org_role_status
  on public.organization_members(organization_id, org_role, membership_kind, status);

create index if not exists idx_org_join_requests_org_status
  on public.organization_join_requests(organization_id, status, created_at desc);

create index if not exists idx_org_announcements_org_created
  on public.organization_announcements(organization_id, created_at desc);

drop trigger if exists trg_organization_join_requests_updated_at on public.organization_join_requests;
create trigger trg_organization_join_requests_updated_at
before update on public.organization_join_requests
for each row execute function public.set_updated_at();

drop trigger if exists trg_organization_announcements_updated_at on public.organization_announcements;
create trigger trg_organization_announcements_updated_at
before update on public.organization_announcements
for each row execute function public.set_updated_at();

alter table public.organization_join_requests enable row level security;
alter table public.organization_announcements enable row level security;

drop policy if exists "organization_join_requests select own or org admin" on public.organization_join_requests;
create policy "organization_join_requests select own or org admin"
on public.organization_join_requests for select
to authenticated
using (
  auth.uid() = requester_id
  or exists (
    select 1
    from public.organization_members m
    where m.organization_id = organization_join_requests.organization_id
      and m.user_id = auth.uid()
      and m.status = 'approved'
      and m.org_role in ('owner', 'admin')
  )
);

drop policy if exists "organization_join_requests insert own" on public.organization_join_requests;
create policy "organization_join_requests insert own"
on public.organization_join_requests for insert
to authenticated
with check (auth.uid() = requester_id);

drop policy if exists "organization_join_requests update org admin" on public.organization_join_requests;
create policy "organization_join_requests update org admin"
on public.organization_join_requests for update
to authenticated
using (
  exists (
    select 1
    from public.organization_members m
    where m.organization_id = organization_join_requests.organization_id
      and m.user_id = auth.uid()
      and m.status = 'approved'
      and m.org_role in ('owner', 'admin')
  )
)
with check (
  exists (
    select 1
    from public.organization_members m
    where m.organization_id = organization_join_requests.organization_id
      and m.user_id = auth.uid()
      and m.status = 'approved'
      and m.org_role in ('owner', 'admin')
  )
);

drop policy if exists "organization_announcements read auth" on public.organization_announcements;
create policy "organization_announcements read auth"
on public.organization_announcements for select
to authenticated
using (true);

drop policy if exists "organization_announcements insert org admin" on public.organization_announcements;
create policy "organization_announcements insert org admin"
on public.organization_announcements for insert
to authenticated
with check (
  auth.uid() = created_by
  and exists (
    select 1
    from public.organization_members m
    where m.organization_id = organization_announcements.organization_id
      and m.user_id = auth.uid()
      and m.status = 'approved'
      and m.org_role in ('owner', 'admin')
  )
);

drop policy if exists "organization_members update owner admin" on public.organization_members;
create policy "organization_members update owner admin"
on public.organization_members for update
to authenticated
using (
  auth.uid() = user_id
  or exists (
    select 1
    from public.organization_members self
    where self.organization_id = organization_members.organization_id
      and self.user_id = auth.uid()
      and self.status = 'approved'
      and self.org_role in ('owner', 'admin')
  )
)
with check (
  auth.uid() = user_id
  or exists (
    select 1
    from public.organization_members self
    where self.organization_id = organization_members.organization_id
      and self.user_id = auth.uid()
      and self.status = 'approved'
      and self.org_role in ('owner', 'admin')
  )
);
