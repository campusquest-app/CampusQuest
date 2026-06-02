-- URI Gym QR check-in: increase reward from 10 → 80 XP (GYM tokens only).

update public.qr_codes
set xp_reward = 80
where code in ('GYM', 'URI_GYM_CHECKIN_V1');

update public.qr_codes
set xp_reward = 80
where code = 'cq_perm_gym_v1'
  and coalesce(location_name, '') ilike '%gym%';
