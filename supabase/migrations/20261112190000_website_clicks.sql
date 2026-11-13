-- Website button taps. Existing event types are profile opens, deal views, pass
-- displays, and Community visits. None of those record a website tap, so there is
-- nothing to copy. click_id makes one intentional tap idempotent when the request is retried.

alter table public.partner_engagement_events
  add column if not exists click_id uuid;

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
  check (event_type in (
    'profile_view',
    'reward_view',
    'reward_pass_authorized',
    'business_view',
    'website_click'
  ));

create unique index if not exists partner_engagement_events_click_id_uidx
  on public.partner_engagement_events (click_id);

comment on column public.partner_engagement_events.click_id is
  'One intentional Website button tap. A retry sends the same id. Null on every other event.';
