-- Superseded by 20260604120000_gym_qr_standard_gym_10xp.sql (official code GYM, 10 XP).
-- Kept for migration history; no-op if already applied.

update public.qr_codes
set xp_reward = 10
where code = 'GYM';
