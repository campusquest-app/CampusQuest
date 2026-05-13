-- Pilot readiness: school verification, campus scoping, and moderation reporting.

create table if not exists public.user_school_verifications (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  school_name text,
  school_domain text,
  status text not null default 'pending' check (status in ('pending', 'verified')),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_school_verifications_status
  on public.user_school_verifications(status, school_domain);

alter table public.student_organizations
  add column if not exists school_domain text;
alter table public.student_organizations
  add column if not exists is_removed_by_moderation boolean not null default false;
alter table public.student_organizations
  add column if not exists moderated_at timestamptz;
alter table public.student_organizations
  add column if not exists moderated_by uuid references public.profiles(id) on delete set null;
alter table public.student_organizations
  add column if not exists moderation_note text;

alter table public.campus_events
  add column if not exists school_name text;
alter table public.campus_events
  add column if not exists school_domain text;
alter table public.campus_events
  add column if not exists is_removed_by_moderation boolean not null default false;
alter table public.campus_events
  add column if not exists moderated_at timestamptz;
alter table public.campus_events
  add column if not exists moderated_by uuid references public.profiles(id) on delete set null;
alter table public.campus_events
  add column if not exists moderation_note text;

update public.student_organizations
set school_domain = lower(split_part(contact_link, '@', 2))
where school_domain is null and contact_link ilike '%@%';

update public.student_organizations
set school_domain = lower(replace(replace(trim(school_name), ' ', ''), '.', ''))
where school_domain is null;

update public.campus_events e
set school_name = coalesce(e.school_name, o.school_name),
    school_domain = coalesce(e.school_domain, o.school_domain)
from public.student_organizations o
where e.host_organization_id = o.id;

create index if not exists idx_student_organizations_school_domain
  on public.student_organizations(school_domain, created_at desc);

create index if not exists idx_campus_events_school_domain
  on public.campus_events(school_domain, starts_at asc);

create table if not exists public.campus_event_reports (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.campus_events(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (reason in ('unsafe', 'harassment', 'scam', 'inappropriate', 'spam', 'other')),
  details text,
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  moderator_note text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, reporter_id)
);

create table if not exists public.organization_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.student_organizations(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (reason in ('unsafe', 'harassment', 'scam', 'inappropriate', 'spam', 'other')),
  details text,
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  moderator_note text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, reporter_id)
);

create index if not exists idx_campus_event_reports_created
  on public.campus_event_reports(status, created_at desc);

create index if not exists idx_organization_reports_created
  on public.organization_reports(status, created_at desc);

drop trigger if exists trg_user_school_verifications_updated_at on public.user_school_verifications;
create trigger trg_user_school_verifications_updated_at
before update on public.user_school_verifications
for each row execute function public.set_updated_at();

drop trigger if exists trg_campus_event_reports_updated_at on public.campus_event_reports;
create trigger trg_campus_event_reports_updated_at
before update on public.campus_event_reports
for each row execute function public.set_updated_at();

drop trigger if exists trg_organization_reports_updated_at on public.organization_reports;
create trigger trg_organization_reports_updated_at
before update on public.organization_reports
for each row execute function public.set_updated_at();

alter table public.user_school_verifications enable row level security;
alter table public.campus_event_reports enable row level security;
alter table public.organization_reports enable row level security;

drop policy if exists "user_school_verifications read own" on public.user_school_verifications;
create policy "user_school_verifications read own"
on public.user_school_verifications for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "user_school_verifications upsert own" on public.user_school_verifications;
create policy "user_school_verifications upsert own"
on public.user_school_verifications for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "user_school_verifications update own" on public.user_school_verifications;
create policy "user_school_verifications update own"
on public.user_school_verifications for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "campus_event_reports read own" on public.campus_event_reports;
create policy "campus_event_reports read own"
on public.campus_event_reports for select
to authenticated
using (auth.uid() = reporter_id);

drop policy if exists "campus_event_reports insert own" on public.campus_event_reports;
create policy "campus_event_reports insert own"
on public.campus_event_reports for insert
to authenticated
with check (auth.uid() = reporter_id);

drop policy if exists "organization_reports read own" on public.organization_reports;
create policy "organization_reports read own"
on public.organization_reports for select
to authenticated
using (auth.uid() = reporter_id);

drop policy if exists "organization_reports insert own" on public.organization_reports;
create policy "organization_reports insert own"
on public.organization_reports for insert
to authenticated
with check (auth.uid() = reporter_id);

drop policy if exists "student_organizations read all auth" on public.student_organizations;
create policy "student_organizations read all auth"
on public.student_organizations for select
to authenticated
using (is_approved = true and is_removed_by_moderation = false);

drop policy if exists "campus_events read auth" on public.campus_events;
create policy "campus_events read auth"
on public.campus_events for select
to authenticated
using (is_removed_by_moderation = false);
