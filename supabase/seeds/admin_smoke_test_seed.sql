-- CampusQuest admin smoke-test seed
-- Safe-by-default: seeds only explicit test emails and labels all records as [SMOKE TEST].
--
-- Usage:
-- 1) Update the 3 email values in cfg below to your TEST accounts.
-- 2) Ensure those accounts already exist in auth.users.
-- 3) Run this script in local/staging (not production).

do $$
declare
  v_admin_id uuid;
  v_reporter_id uuid;
  v_reported_id uuid;
  v_conversation_id uuid;
  v_message_resolve_id uuid;
  v_message_dismiss_id uuid;
begin
  -- Update these emails for your test environment.
  with cfg as (
    select
      lower(trim('nicholaslockhart22@gmail.com'))::text as admin_email,
      lower(trim('campusquest+smoke-reporter@campusquest.app'))::text as reporter_email,
      lower(trim('campusquest+smoke-reported@campusquest.app'))::text as reported_email
  )
  select
    (select id from auth.users where lower(trim(email)) = cfg.admin_email limit 1),
    (select id from auth.users where lower(trim(email)) = cfg.reporter_email limit 1),
    (select id from auth.users where lower(trim(email)) = cfg.reported_email limit 1)
  into v_admin_id, v_reporter_id, v_reported_id
  from cfg;

  if v_admin_id is null or v_reporter_id is null or v_reported_id is null then
    raise exception
      'Missing required test users in auth.users. Create accounts for admin/reporter/reported emails configured in this seed first.';
  end if;

  -- Ensure profiles exist for the three test users.
  insert into public.profiles (id, username, display_name, avatar_url, bio)
  values
    (v_admin_id, 'smoke_admin', 'Smoke Admin', null, '[SMOKE TEST] Admin profile'),
    (v_reporter_id, 'smoke_reporter', 'Smoke Reporter', null, '[SMOKE TEST] Reporter profile'),
    (v_reported_id, 'smoke_reported', 'Smoke Reported', null, '[SMOKE TEST] Reported profile')
  on conflict (id) do update
    set
      username = excluded.username,
      display_name = excluded.display_name,
      bio = excluded.bio;

  insert into public.user_account_safety (user_id, status, reason, suspended_until, updated_by)
  values
    (v_admin_id, 'active', '[SMOKE TEST] baseline status', null, v_admin_id),
    (v_reporter_id, 'active', '[SMOKE TEST] baseline status', null, v_admin_id),
    (v_reported_id, 'active', '[SMOKE TEST] baseline status', null, v_admin_id)
  on conflict (user_id) do update
    set
      status = 'active',
      reason = '[SMOKE TEST] baseline status',
      suspended_until = null,
      updated_by = v_admin_id;

  -- Create or reuse direct conversation.
  insert into public.direct_conversations (direct_key, created_by)
  values (
    case
      when v_reporter_id::text < v_reported_id::text
        then v_reporter_id::text || ':' || v_reported_id::text
      else v_reported_id::text || ':' || v_reporter_id::text
    end,
    v_admin_id
  )
  on conflict (direct_key) do nothing;

  select id
  into v_conversation_id
  from public.direct_conversations
  where direct_key = case
    when v_reporter_id::text < v_reported_id::text
      then v_reporter_id::text || ':' || v_reported_id::text
    else v_reported_id::text || ':' || v_reporter_id::text
  end
  limit 1;

  insert into public.direct_conversation_participants (conversation_id, user_id)
  values
    (v_conversation_id, v_reporter_id),
    (v_conversation_id, v_reported_id)
  on conflict (conversation_id, user_id) do nothing;

  -- Seed two messages so you can test both resolve and dismiss flows.
  insert into public.direct_messages (conversation_id, sender_id, recipient_id, content)
  select v_conversation_id, v_reporter_id, v_reported_id, '[SMOKE TEST] Resolve-path report message'
  where not exists (
    select 1
    from public.direct_messages dm
    where dm.conversation_id = v_conversation_id
      and dm.content = '[SMOKE TEST] Resolve-path report message'
  );

  insert into public.direct_messages (conversation_id, sender_id, recipient_id, content)
  select v_conversation_id, v_reporter_id, v_reported_id, '[SMOKE TEST] Dismiss-path report message'
  where not exists (
    select 1
    from public.direct_messages dm
    where dm.conversation_id = v_conversation_id
      and dm.content = '[SMOKE TEST] Dismiss-path report message'
  );

  select id into v_message_resolve_id
  from public.direct_messages
  where conversation_id = v_conversation_id
    and content = '[SMOKE TEST] Resolve-path report message'
  order by created_at desc
  limit 1;

  select id into v_message_dismiss_id
  from public.direct_messages
  where conversation_id = v_conversation_id
    and content = '[SMOKE TEST] Dismiss-path report message'
  order by created_at desc
  limit 1;

  insert into public.message_reports (message_id, reporter_id, reported_user_id, reason, details, status)
  values
    (v_message_resolve_id, v_reporter_id, v_reported_id, 'unsafe', '[SMOKE TEST] Report for resolve action', 'open'),
    (v_message_dismiss_id, v_reporter_id, v_reported_id, 'other', '[SMOKE TEST] Report for dismiss action', 'open')
  on conflict (message_id, reporter_id) do update
    set
      status = 'open',
      details = excluded.details,
      moderator_note = null,
      reviewed_at = null,
      reviewed_by = null;

  insert into public.user_safety_appeals (user_id, message, status)
  select v_reported_id, '[SMOKE TEST] Please review my account status for admin appeal testing.', 'pending'
  where not exists (
    select 1
    from public.user_safety_appeals usa
    where usa.user_id = v_reported_id
      and usa.status = 'pending'
      and usa.message = '[SMOKE TEST] Please review my account status for admin appeal testing.'
  );
end
$$;
