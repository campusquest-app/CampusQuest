-- Purple Embers reuse quad_post_reactions.reaction_type = 'spark'.
-- Do not rename the column or existing rows. Historical Sparks stay intact
-- and only count toward today's 3-Ember allowance when created_at falls
-- on the current America/New_York calendar day.

create or replace function public.enforce_daily_ember_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  used integer;
  day_start timestamptz;
begin
  if new.reaction_type is distinct from 'spark' then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ember:' || new.user_id::text, 0));

  day_start := date_trunc('day', timezone('America/New_York', now()))
    at time zone 'America/New_York';

  select count(*) into used
  from public.quad_post_reactions
  where user_id = new.user_id
    and reaction_type = 'spark'
    and created_at >= day_start
    and created_at < day_start + interval '1 day';

  if used >= 3 then
    raise exception 'ember_daily_limit'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_daily_ember_limit on public.quad_post_reactions;
create trigger trg_enforce_daily_ember_limit
before insert on public.quad_post_reactions
for each row execute function public.enforce_daily_ember_limit();

revoke all on function public.enforce_daily_ember_limit() from public;
revoke all on function public.enforce_daily_ember_limit() from anon;
revoke all on function public.enforce_daily_ember_limit() from authenticated;

comment on function public.enforce_daily_ember_limit() is
  'Caps Ember (spark) inserts at 3 per user per America/New_York calendar day. Historical spark rows from prior campus days are ignored.';

-- In-app Ember notifications (not added to native push).
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (
  type in (
    'direct_message',
    'connection_accepted',
    'friend_request',
    'quad_post_like',
    'quad_post_ember',
    'quad_post_comment',
    'quad_post_tag',
    'quad_post_mention',
    'quad_post_tag_approval',
    'event_rsvp_reminder',
    'organization_event_announcement',
    'moderation_safety_update',
    'organization_request_submitted',
    'organization_request_approved',
    'organization_request_denied',
    'marketplace_offer',
    'marketplace_offer_accepted',
    'marketplace_offer_declined',
    'verification_request_submitted',
    'verification_request_approved',
    'verification_request_needs_info',
    'verification_request_rejected'
  )
);
