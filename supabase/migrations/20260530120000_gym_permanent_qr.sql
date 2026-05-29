-- URI Gym permanent QR (code: GYM) — database is source of truth for QR content.

alter table public.qr_codes
  add column if not exists activity_name text;

-- Official URI Gym check-in (replaces pilot token cq_perm_gym_v1 for new scans)
insert into public.qr_codes (
  code,
  title,
  description,
  type,
  location_name,
  activity_name,
  xp_reward,
  is_active,
  is_permanent,
  cooldown_hours,
  max_scans_per_day,
  expires_at
)
values (
  'GYM',
  'URI Gym Check-In',
  'Check in at the URI Gym and build your strength streak.',
  'permanent_location',
  'URI Gym',
  'Hitting the Gym',
  10,
  true,
  true,
  24,
  1,
  null
)
on conflict (code) do update set
  title = excluded.title,
  description = excluded.description,
  type = excluded.type,
  location_name = excluded.location_name,
  activity_name = excluded.activity_name,
  xp_reward = excluded.xp_reward,
  is_active = excluded.is_active,
  is_permanent = excluded.is_permanent,
  cooldown_hours = excluded.cooldown_hours,
  max_scans_per_day = excluded.max_scans_per_day,
  expires_at = excluded.expires_at;

-- Deactivate legacy pilot gym token so scans resolve to GYM only
update public.qr_codes
set is_active = false
where code = 'cq_perm_gym_v1'
  and exists (select 1 from public.qr_codes where code = 'GYM');
