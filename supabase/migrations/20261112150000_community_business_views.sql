-- Community listing views for the business dashboard.
-- Older profile_view and reward_view rows are opens of a profile or a deal, not a record of
-- which businesses were on the Community list, so they are not copied into business_view.

alter table public.partner_engagement_events
  add column if not exists visit_id uuid;

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.partner_engagement_events'::regclass
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%event_type%'
  loop
    execute format('alter table public.partner_engagement_events drop constraint %I', constraint_name);
  end loop;
end $$;

alter table public.partner_engagement_events
  drop constraint if exists partner_engagement_events_event_type_check;

alter table public.partner_engagement_events
  add constraint partner_engagement_events_event_type_check
  check (event_type in ('profile_view', 'reward_view', 'reward_pass_authorized', 'business_view'));

create unique index if not exists partner_engagement_events_visit_partner_uidx
  on public.partner_engagement_events (visit_id, partner_id);

comment on table public.partner_engagement_events is
  'Profile views, reward views, reward pass displays, and Community listing views. Not purchases or redemptions. Service role only. business_view counts a student Community visit once per listed business and is not backfilled from older events.';
