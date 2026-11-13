-- Restore the old Offer views card into Business views.
-- That card counted reward_view rows on partner_engagement_events, one per business.
-- Community tracking went live at the first business_view whose source_event_id is null.
-- Deal views before that instant are copied in. Later deal views stay reward_view rows.
-- Profile opens were never Offer views, so they are not copied.
-- source_event_id makes a rerun insert nothing for a deal view that was already copied.

alter table public.partner_engagement_events
  add column if not exists source_event_id bigint;

create unique index if not exists partner_engagement_events_source_event_uidx
  on public.partner_engagement_events (source_event_id);

insert into public.partner_engagement_events
  (partner_id, user_id, event_type, created_at, visit_id, source_event_id)
select
  source.partner_id,
  source.user_id,
  'business_view',
  source.created_at,
  null,
  source.id
from public.partner_engagement_events source
where source.event_type = 'reward_view'
  and source.created_at < (
    select min(organic.created_at)
    from public.partner_engagement_events organic
    where organic.event_type = 'business_view'
      and organic.source_event_id is null
  )
on conflict (source_event_id) do nothing;

comment on column public.partner_engagement_events.source_event_id is
  'Set on a business_view copied from an earlier reward_view. Null on a Community visit.';

comment on table public.partner_engagement_events is
  'Profile views, reward views, reward pass displays, and Community listing views. Not purchases or redemptions. Service role only. business_view counts a student Community visit once per listed business, plus deal views copied from reward_view before that tracking started.';
