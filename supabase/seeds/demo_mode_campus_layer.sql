-- Demo mode seed for Events + Organizations + Notifications
-- Safe for local/staging usage.
-- Uses existing users in public.profiles as "sample users" and does not expose emails.

do $$
declare
  v_creator uuid;
  v_member_a uuid;
  v_member_b uuid;
  v_org_a uuid;
  v_org_b uuid;
  v_event_a uuid;
  v_event_b uuid;
begin
  select id into v_creator from public.profiles order by created_at asc limit 1;
  select id into v_member_a from public.profiles where id <> v_creator order by created_at asc limit 1;
  select id into v_member_b from public.profiles where id not in (v_creator, v_member_a) order by created_at asc limit 1;

  if v_creator is null then
    raise exception 'Demo seed requires at least one profile row.';
  end if;

  insert into public.student_organizations (name, description, category, school_name, created_by, contact_link, logo_url, is_approved)
  values
    ('[DEMO] Builders Club', 'Demo organization for engineering and startup-minded students.', 'Tech', 'University of Rhode Island', v_creator, 'https://example.org/builders', null, true),
    ('[DEMO] Campus Wellness Collective', 'Demo organization for wellness events and social support.', 'Wellness', 'University of Rhode Island', v_creator, 'https://example.org/wellness', null, true)
  on conflict do nothing;

  select id into v_org_a from public.student_organizations where name = '[DEMO] Builders Club' limit 1;
  select id into v_org_b from public.student_organizations where name = '[DEMO] Campus Wellness Collective' limit 1;

  insert into public.organization_members (organization_id, user_id, role)
  values
    (v_org_a, v_creator, 'manager'),
    (v_org_b, v_creator, 'manager')
  on conflict (organization_id, user_id) do nothing;

  if v_member_a is not null then
    insert into public.organization_members (organization_id, user_id, role)
    values (v_org_a, v_member_a, 'follower')
    on conflict (organization_id, user_id) do nothing;
  end if;

  if v_member_b is not null then
    insert into public.organization_members (organization_id, user_id, role)
    values (v_org_b, v_member_b, 'follower')
    on conflict (organization_id, user_id) do nothing;
  end if;

  insert into public.campus_events (
    title,
    description,
    category,
    location_name,
    starts_at,
    ends_at,
    is_paid,
    host_organization_id,
    created_by
  )
  values
    (
      '[DEMO] Campus Maker Sprint',
      'A demo rapid-build event where students form teams and ship mini prototypes.',
      'Tech',
      'Memorial Union Lab',
      now() + interval '2 days',
      now() + interval '2 days 2 hours',
      false,
      v_org_a,
      v_creator
    ),
    (
      '[DEMO] Sunset Wellness Meetup',
      'A demo community event for walks, mindfulness, and meeting new students.',
      'Wellness',
      'Quadrangle Lawn',
      now() + interval '4 days',
      now() + interval '4 days 90 minutes',
      false,
      v_org_b,
      v_creator
    )
  on conflict do nothing;

  select id into v_event_a from public.campus_events where title = '[DEMO] Campus Maker Sprint' limit 1;
  select id into v_event_b from public.campus_events where title = '[DEMO] Sunset Wellness Meetup' limit 1;

  if v_member_a is not null and v_event_a is not null then
    insert into public.event_rsvps (event_id, user_id, status)
    values (v_event_a, v_member_a, 'going')
    on conflict (event_id, user_id) do update set status = excluded.status;
  end if;

  if v_member_b is not null and v_event_b is not null then
    insert into public.event_rsvps (event_id, user_id, status)
    values (v_event_b, v_member_b, 'interested')
    on conflict (event_id, user_id) do update set status = excluded.status;
  end if;

  insert into public.notifications (user_id, type, title, body, related_entity_type, related_entity_id)
  values
    (v_creator, 'organization_event_announcement', '[DEMO] New org announcement', 'Builders Club posted a new demo event.', 'event', v_event_a),
    (v_creator, 'event_rsvp_reminder', '[DEMO] RSVP reminder', 'Your demo event starts soon. Check details and arrive early.', 'event', v_event_b),
    (v_creator, 'connection_accepted', '[DEMO] Connection accepted', 'A demo student accepted your connection request.', 'connection_request', null)
  on conflict do nothing;
end
$$;
