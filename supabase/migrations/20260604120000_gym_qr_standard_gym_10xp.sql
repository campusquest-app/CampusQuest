-- Standardize URI Gym on code GYM with 10 XP reward (official printable QR encodes "GYM").

update public.qr_codes
set
  title = 'URI Gym Check-In',
  xp_reward = 10,
  activity_name = 'Hitting the Gym',
  is_active = true
where code = 'GYM';

-- Legacy token remains scannable but is not the primary printable code.
update public.qr_codes
set is_active = false
where code = 'URI_GYM_CHECKIN_V1'
  and exists (select 1 from public.qr_codes where code = 'GYM' and is_active = true);
