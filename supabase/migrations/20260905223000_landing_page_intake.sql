-- Landing-page intake tables for the separate CampusQuest marketing site.
-- Schema ownership: MAIN CampusQuest repo only.
--
-- Purpose:
--   public.landing_page_leads           — waitlist / interest captures
--   public.landing_contact_submissions  — contact form messages
--
-- Cross-repo contract:
--   The landing deployment inserts via a server-only SUPABASE_SERVICE_ROLE_KEY client
--   (POST /api/leads, POST /api/contact). Service role bypasses RLS.
--
-- Security:
--   RLS is enabled on both tables.
--   There are NO policies for anon or non-admin authenticated roles that allow
--   SELECT / INSERT / UPDATE / DELETE of these private contact records.
--   Admin SELECT + UPDATE use profiles.role in ('admin', 'super_admin')
--   (same authorization model as campus_locations / map override admin policies).
--   Do NOT invent a second admin system.
--
-- updated_at:
--   Reuses existing public.set_updated_at() from earlier migrations
--   (e.g. 20260511195900_campusquest_mvp.sql). Do not redefine it here.
--
-- Does NOT modify: auth.users, profiles, organizations, events, quests, or other product data.
-- Idempotent: safe to re-run.

-- ---------------------------------------------------------------------------
-- landing_page_leads
-- ---------------------------------------------------------------------------
create table if not exists public.landing_page_leads (
  id uuid primary key default gen_random_uuid(),
  email text not null check (char_length(trim(email)) between 3 and 254),
  -- Landing API always sends interest_type (zod enum). NOT NULL keeps unique
  -- index (lower(email), interest_type) free of PostgreSQL NULL-duplicate quirks.
  interest_type text not null check (
    interest_type in ('student', 'genius', 'organization')
  ),
  name text check (name is null or char_length(name) <= 200),
  campus text check (campus is null or char_length(campus) <= 200),
  source text default 'landing' check (source is null or char_length(source) <= 120),
  utm_source text check (utm_source is null or char_length(utm_source) <= 200),
  utm_medium text check (utm_medium is null or char_length(utm_medium) <= 200),
  utm_campaign text check (utm_campaign is null or char_length(utm_campaign) <= 200),
  utm_content text check (utm_content is null or char_length(utm_content) <= 200),
  utm_term text check (utm_term is null or char_length(utm_term) <= 200),
  referrer text check (referrer is null or char_length(referrer) <= 2048),
  landing_path text check (landing_path is null or char_length(landing_path) <= 500),
  user_agent text check (user_agent is null or char_length(user_agent) <= 500),
  ip_hash text check (ip_hash is null or char_length(ip_hash) <= 128),
  status text not null default 'new' check (
    status in ('new', 'in_progress', 'resolved', 'spam')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.landing_page_leads is
  'Marketing-site interest / waitlist leads. Written by the landing API with service role; not readable by normal users.';

comment on column public.landing_page_leads.ip_hash is
  'Hashed client IP from the landing API — never store raw IPs here.';

-- Deliberate dedupe matching the landing API (23505 → duplicate: true):
-- same email + same interest_type only. Does NOT globally unique email.
create unique index if not exists landing_page_leads_email_interest_uidx
  on public.landing_page_leads (lower(email), interest_type);

create index if not exists landing_page_leads_email_idx
  on public.landing_page_leads (lower(email));

create index if not exists landing_page_leads_created_idx
  on public.landing_page_leads (created_at desc);

create index if not exists landing_page_leads_status_created_idx
  on public.landing_page_leads (status, created_at desc);

drop trigger if exists trg_landing_page_leads_updated_at on public.landing_page_leads;
create trigger trg_landing_page_leads_updated_at
before update on public.landing_page_leads
for each row execute function public.set_updated_at();

alter table public.landing_page_leads enable row level security;

-- Restrictive: no anon / non-admin authenticated access.
-- Service role bypasses RLS for landing inserts.
drop policy if exists landing_page_leads_admin_select on public.landing_page_leads;
create policy landing_page_leads_admin_select
  on public.landing_page_leads
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin', 'super_admin')
    )
  );

drop policy if exists landing_page_leads_admin_update on public.landing_page_leads;
create policy landing_page_leads_admin_update
  on public.landing_page_leads
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin', 'super_admin')
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin', 'super_admin')
    )
  );

-- Explicit service_role ALL (defense in depth; service role already bypasses RLS).
drop policy if exists landing_page_leads_service_role on public.landing_page_leads;
create policy landing_page_leads_service_role
  on public.landing_page_leads
  for all
  to service_role
  using (true)
  with check (true);

-- ---------------------------------------------------------------------------
-- landing_contact_submissions
-- ---------------------------------------------------------------------------
-- Landing API currently inserts: email, name (nullable), message, source,
-- user_agent, ip_hash. It does NOT send reason/status — defaults apply.
-- name stays nullable so current landing inserts succeed without modification.
create table if not exists public.landing_contact_submissions (
  id uuid primary key default gen_random_uuid(),
  name text check (name is null or char_length(name) <= 200),
  email text not null check (char_length(trim(email)) between 3 and 254),
  reason text not null default 'other' check (
    reason in (
      'student_question',
      'organization_question',
      'business_question',
      'partnership',
      'technical_issue',
      'other'
    )
  ),
  message text not null check (char_length(trim(message)) between 1 and 4000),
  source text default 'landing' check (source is null or char_length(source) <= 120),
  user_agent text check (user_agent is null or char_length(user_agent) <= 500),
  ip_hash text check (ip_hash is null or char_length(ip_hash) <= 128),
  status text not null default 'new' check (
    status in ('new', 'in_progress', 'resolved', 'spam')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.landing_contact_submissions is
  'Marketing-site contact form submissions. Written by the landing API with service role; not readable by normal users.';

create index if not exists landing_contact_submissions_email_created_idx
  on public.landing_contact_submissions (lower(email), created_at desc);

create index if not exists landing_contact_submissions_created_idx
  on public.landing_contact_submissions (created_at desc);

create index if not exists landing_contact_submissions_status_created_idx
  on public.landing_contact_submissions (status, created_at desc);

create index if not exists landing_contact_submissions_reason_created_idx
  on public.landing_contact_submissions (reason, created_at desc);

drop trigger if exists trg_landing_contact_submissions_updated_at on public.landing_contact_submissions;
create trigger trg_landing_contact_submissions_updated_at
before update on public.landing_contact_submissions
for each row execute function public.set_updated_at();

alter table public.landing_contact_submissions enable row level security;

drop policy if exists landing_contact_submissions_admin_select on public.landing_contact_submissions;
create policy landing_contact_submissions_admin_select
  on public.landing_contact_submissions
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin', 'super_admin')
    )
  );

drop policy if exists landing_contact_submissions_admin_update on public.landing_contact_submissions;
create policy landing_contact_submissions_admin_update
  on public.landing_contact_submissions
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin', 'super_admin')
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin', 'super_admin')
    )
  );

drop policy if exists landing_contact_submissions_service_role on public.landing_contact_submissions;
create policy landing_contact_submissions_service_role
  on public.landing_contact_submissions
  for all
  to service_role
  using (true)
  with check (true);

revoke all on public.landing_page_leads from anon, authenticated;
revoke all on public.landing_contact_submissions from anon, authenticated;
grant select, update on public.landing_page_leads to authenticated;
grant select, update on public.landing_contact_submissions to authenticated;
grant all on public.landing_page_leads to service_role;
grant all on public.landing_contact_submissions to service_role;
