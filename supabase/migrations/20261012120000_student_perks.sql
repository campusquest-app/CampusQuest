-- Student Perks: saved partner businesses, partner suggestions, and partner analytics.
--
-- Partner records, hours, and reward offers stay in lib/partners/partnerDirectory.ts for now, so
-- partner_id is the directory's text id (e.g. 'daisys-chicken-ice-cream'), validated by the API.
--
-- partner_favorites       Private per-user bookmarks. Owner-only read/insert/delete under RLS.
-- partner_suggestions     "Suggest a Business" submissions for admin review. Owners may read their
--                         own rows. Only the service role inserts (via /api/partners/suggestions,
--                         after auth, account-safety, and validation checks) and reviews.
--                         A trigger caps each account at 5 suggestions per rolling 24 hours and
--                         rejects same-day duplicates, serialized per user so concurrent requests
--                         from any number of server instances cannot exceed the limit.
-- partner_engagement_events
--                         Profile views, reward views, and server-authorized reward pass displays.
--                         These are NOT purchases or redemptions. Written only by the service role;
--                         clients have no access.
--
-- This migration only creates new tables. It does not alter or delete existing data.

-- 1. Saved businesses -------------------------------------------------------

create table if not exists public.partner_favorites (
  user_id uuid not null references public.profiles(id) on delete cascade,
  partner_id text not null check (partner_id ~ '^[a-z0-9-]{1,80}$'),
  created_at timestamptz not null default now(),
  primary key (user_id, partner_id)
);

create index if not exists idx_partner_favorites_user_created
  on public.partner_favorites (user_id, created_at desc);

alter table public.partner_favorites enable row level security;

drop policy if exists "partner_favorites read own" on public.partner_favorites;
create policy "partner_favorites read own"
  on public.partner_favorites for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "partner_favorites insert own" on public.partner_favorites;
create policy "partner_favorites insert own"
  on public.partner_favorites for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "partner_favorites delete own" on public.partner_favorites;
create policy "partner_favorites delete own"
  on public.partner_favorites for delete
  to authenticated
  using (user_id = auth.uid());

revoke all on table public.partner_favorites from public;
revoke all on table public.partner_favorites from anon;
revoke all on table public.partner_favorites from authenticated;
grant select, insert, delete on table public.partner_favorites to authenticated;

comment on table public.partner_favorites is
  'Private saved CampusQuest partner businesses. Each user can only read, add, and remove their own rows.';

-- 2. Partner suggestions ----------------------------------------------------

create table if not exists public.partner_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  business_name text not null check (char_length(btrim(business_name)) between 2 and 120),
  location text check (location is null or char_length(location) <= 160),
  reason text check (reason is null or char_length(reason) <= 500),
  status text not null default 'pending'
    check (status in ('pending', 'reviewed', 'contacted', 'partnered', 'declined')),
  admin_note text check (admin_note is null or char_length(admin_note) <= 1000),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_partner_suggestions_user_created
  on public.partner_suggestions (user_id, created_at desc);

create index if not exists idx_partner_suggestions_status_created
  on public.partner_suggestions (status, created_at desc);

create or replace function public.partner_suggestions_enforce_daily_limit()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  recent_count integer;
begin
  -- Serialize inserts per user until commit; without this, concurrent transactions each count
  -- the same committed rows and can all pass the limit.
  perform pg_advisory_xact_lock(hashtextextended('partner_suggestions:' || new.user_id::text, 0));

  -- The window is measured on server time only.
  new.created_at := now();
  new.status := 'pending';
  new.admin_note := null;
  new.reviewed_by := null;
  new.reviewed_at := null;

  select count(*) into recent_count
  from public.partner_suggestions
  where user_id = new.user_id
    and created_at > now() - interval '24 hours';
  if recent_count >= 5 then
    raise exception 'partner_suggestions_daily_limit';
  end if;

  if exists (
    select 1
    from public.partner_suggestions
    where user_id = new.user_id
      and created_at > now() - interval '24 hours'
      and lower(btrim(business_name)) = lower(btrim(new.business_name))
  ) then
    raise exception 'partner_suggestions_duplicate';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_partner_suggestions_daily_limit on public.partner_suggestions;
create trigger trg_partner_suggestions_daily_limit
before insert on public.partner_suggestions
for each row execute function public.partner_suggestions_enforce_daily_limit();

alter table public.partner_suggestions enable row level security;

drop policy if exists "partner_suggestions read own" on public.partner_suggestions;
create policy "partner_suggestions read own"
  on public.partner_suggestions for select
  to authenticated
  using (user_id = auth.uid());

-- No client insert policy: direct PostgREST inserts would skip the API's account-safety check,
-- honeypot, and burst limit.
drop policy if exists "partner_suggestions insert own pending" on public.partner_suggestions;

revoke all on table public.partner_suggestions from public;
revoke all on table public.partner_suggestions from anon;
revoke all on table public.partner_suggestions from authenticated;
grant select on table public.partner_suggestions to authenticated;

revoke all on function public.partner_suggestions_enforce_daily_limit() from public;
revoke all on function public.partner_suggestions_enforce_daily_limit() from anon;
revoke all on function public.partner_suggestions_enforce_daily_limit() from authenticated;

comment on table public.partner_suggestions is
  'Student suggestions for future CampusQuest partners. Inserted by the API with the service role; students read their own; admins review with the service role.';

-- 3. Partner engagement analytics ------------------------------------------

create table if not exists public.partner_engagement_events (
  id bigint generated always as identity primary key,
  partner_id text not null check (partner_id ~ '^[a-z0-9-]{1,80}$'),
  user_id uuid references public.profiles(id) on delete set null,
  event_type text not null check (event_type in ('profile_view', 'reward_view', 'reward_pass_authorized')),
  created_at timestamptz not null default now()
);

create index if not exists idx_partner_engagement_partner_type_created
  on public.partner_engagement_events (partner_id, event_type, created_at desc);

alter table public.partner_engagement_events enable row level security;

revoke all on table public.partner_engagement_events from public;
revoke all on table public.partner_engagement_events from anon;
revoke all on table public.partner_engagement_events from authenticated;

comment on table public.partner_engagement_events is
  'Partner profile views, reward views, and server-authorized reward pass displays. Not purchases or redemptions. Service role only.';
