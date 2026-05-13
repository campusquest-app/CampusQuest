-- Gameplay columns for user_stats (idempotent ADD COLUMN IF NOT EXISTS).
--
-- App usage audit (GET/PATCH + persistence):
--   app/api/me/stats/route.ts: select *; PATCH updates total_xp, level, strength, stamina,
--     knowledge, social, focus, bosses_defeated.
--   lib/client/gameStateSync.ts: PATCH same numeric stats + bossesDefeated.
--   lib/client/profileCharacter.ts (MeStatsRow): user_id, level, total_xp, stats row, bosses_defeated.
--   lib/server/playerSetup.ts, lib/server/services.ts: inserts/updates on user_stats incl. bosses_defeated, total_xp, level.
-- Final bosses count is primarily in profiles.game_state_json; final_bosses_defeated here is for optional DB parity.
-- Streaks are also surfaced on profiles (streak_days); current/longest/streak_saves are reserved here for future gameplay.

alter table public.user_stats
  add column if not exists total_xp bigint not null default 0 check (total_xp >= 0),
  add column if not exists level integer not null default 1 check (level >= 1),
  add column if not exists strength integer not null default 0 check (strength >= 0),
  add column if not exists stamina integer not null default 0 check (stamina >= 0),
  add column if not exists knowledge integer not null default 0 check (knowledge >= 0),
  add column if not exists social integer not null default 0 check (social >= 0),
  add column if not exists focus integer not null default 0 check (focus >= 0),
  add column if not exists bosses_defeated integer not null default 0 check (bosses_defeated >= 0),
  add column if not exists final_bosses_defeated integer not null default 0 check (final_bosses_defeated >= 0),
  add column if not exists current_streak integer not null default 0 check (current_streak >= 0),
  add column if not exists longest_streak integer not null default 0 check (longest_streak >= 0),
  add column if not exists streak_saves integer not null default 0 check (streak_saves >= 0),
  add column if not exists updated_at timestamptz not null default now();
