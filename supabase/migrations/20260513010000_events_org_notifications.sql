-- Event discovery, student organizations, and in-app notifications

create table if not exists public.student_organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  category text not null check (char_length(category) between 2 and 80),
  logo_url text,
  school_name text not null check (char_length(school_name) between 2 and 120),
  contact_link text,
  created_by uuid not null references public.profiles(id) on delete cascade,
  is_approved boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_student_organizations_school_category
  on public.student_organizations(school_name, category, created_at desc);

create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.student_organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('follower', 'member', 'manager')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index if not exists idx_organization_members_org
  on public.organization_members(organization_id, role, created_at desc);

create index if not exists idx_organization_members_user
  on public.organization_members(user_id, created_at desc);

create table if not exists public.campus_events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 180),
  description text not null default '' check (char_length(description) <= 3000),
  category text not null check (char_length(category) between 2 and 80),
  location_name text not null check (char_length(location_name) between 2 and 180),
  starts_at timestamptz not null,
  ends_at timestamptz,
  is_paid boolean not null default false,
  ticket_link text,
  host_organization_id uuid references public.student_organizations(id) on delete set null,
  created_by uuid not null references public.profiles(id) on delete cascade,
  is_cancelled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or ends_at >= starts_at)
);

create index if not exists idx_campus_events_starts_at
  on public.campus_events(starts_at asc, created_at desc);

create index if not exists idx_campus_events_org
  on public.campus_events(host_organization_id, starts_at asc);

create table if not exists public.event_rsvps (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.campus_events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null check (status in ('going', 'interested', 'not_going')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, user_id)
);

create index if not exists idx_event_rsvps_event
  on public.event_rsvps(event_id, status, created_at desc);

create index if not exists idx_event_rsvps_user
  on public.event_rsvps(user_id, updated_at desc);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (
    type in (
      'direct_message',
      'connection_accepted',
      'event_rsvp_reminder',
      'organization_event_announcement',
      'moderation_safety_update'
    )
  ),
  title text not null check (char_length(title) between 1 and 180),
  body text not null check (char_length(body) <= 1000),
  related_entity_type text check (char_length(related_entity_type) <= 64),
  related_entity_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- Backward-compatible upgrades for projects that already had
-- an earlier notifications table shape.
alter table public.notifications
  add column if not exists related_entity_type text;

alter table public.notifications
  add column if not exists related_entity_id uuid;

alter table public.notifications
  add column if not exists read_at timestamptz;

create index if not exists idx_notifications_user_created
  on public.notifications(user_id, created_at desc);

create index if not exists idx_notifications_user_unread
  on public.notifications(user_id, read_at, created_at desc);

drop trigger if exists trg_student_organizations_updated_at on public.student_organizations;
create trigger trg_student_organizations_updated_at
before update on public.student_organizations
for each row execute function public.set_updated_at();

drop trigger if exists trg_organization_members_updated_at on public.organization_members;
create trigger trg_organization_members_updated_at
before update on public.organization_members
for each row execute function public.set_updated_at();

drop trigger if exists trg_campus_events_updated_at on public.campus_events;
create trigger trg_campus_events_updated_at
before update on public.campus_events
for each row execute function public.set_updated_at();

drop trigger if exists trg_event_rsvps_updated_at on public.event_rsvps;
create trigger trg_event_rsvps_updated_at
before update on public.event_rsvps
for each row execute function public.set_updated_at();

alter table public.student_organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.campus_events enable row level security;
alter table public.event_rsvps enable row level security;
alter table public.notifications enable row level security;

drop policy if exists "student_organizations read all auth" on public.student_organizations;
create policy "student_organizations read all auth"
on public.student_organizations for select
to authenticated
using (is_approved = true);

drop policy if exists "student_organizations create own" on public.student_organizations;
create policy "student_organizations create own"
on public.student_organizations for insert
to authenticated
with check (auth.uid() = created_by);

drop policy if exists "student_organizations update creator" on public.student_organizations;
create policy "student_organizations update creator"
on public.student_organizations for update
to authenticated
using (auth.uid() = created_by)
with check (auth.uid() = created_by);

drop policy if exists "organization_members read auth" on public.organization_members;
create policy "organization_members read auth"
on public.organization_members for select
to authenticated
using (true);

drop policy if exists "organization_members upsert self" on public.organization_members;
create policy "organization_members upsert self"
on public.organization_members for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "organization_members update self" on public.organization_members;
create policy "organization_members update self"
on public.organization_members for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "organization_members delete self" on public.organization_members;
create policy "organization_members delete self"
on public.organization_members for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "campus_events read auth" on public.campus_events;
create policy "campus_events read auth"
on public.campus_events for select
to authenticated
using (true);

drop policy if exists "campus_events create own" on public.campus_events;
create policy "campus_events create own"
on public.campus_events for insert
to authenticated
with check (auth.uid() = created_by);

drop policy if exists "campus_events update creator" on public.campus_events;
create policy "campus_events update creator"
on public.campus_events for update
to authenticated
using (auth.uid() = created_by)
with check (auth.uid() = created_by);

drop policy if exists "event_rsvps read own and event creators" on public.event_rsvps;
create policy "event_rsvps read own and event creators"
on public.event_rsvps for select
to authenticated
using (
  auth.uid() = user_id
  or exists (
    select 1
    from public.campus_events e
    where e.id = event_rsvps.event_id
      and e.created_by = auth.uid()
  )
);

drop policy if exists "event_rsvps upsert own" on public.event_rsvps;
create policy "event_rsvps upsert own"
on public.event_rsvps for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "event_rsvps update own" on public.event_rsvps;
create policy "event_rsvps update own"
on public.event_rsvps for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "notifications read own" on public.notifications;
create policy "notifications read own"
on public.notifications for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "notifications update own" on public.notifications;
create policy "notifications update own"
on public.notifications for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
