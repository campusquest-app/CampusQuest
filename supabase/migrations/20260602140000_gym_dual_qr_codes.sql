-- URI Gym: support both GYM and legacy URI_GYM_CHECKIN_V1 tokens.

alter table public.qr_codes add column if not exists event_id uuid;
alter table public.qr_codes add column if not exists quest_id uuid;
alter table public.qr_codes add column if not exists requires_staff_approval boolean not null default false;

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
values
(
  'GYM',
  'URI Gym Check-In',
  'Check in at the URI Gym and build your strength streak.',
  'permanent_location',
  'URI Gym',
  'Hitting the Gym',
  80,
  true,
  true,
  24,
  1,
  null
),
(
  'URI_GYM_CHECKIN_V1',
  'URI Gym Check-In',
  'Legacy URI Gym QR code.',
  'permanent_location',
  'URI Gym',
  'Hitting the Gym',
  80,
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
