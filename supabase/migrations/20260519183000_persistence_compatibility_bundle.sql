-- ============================================================================
-- CampusQuest persistence compatibility (single idempotent bundle)
-- ============================================================================
--
-- Columns required by persistence / hydration (inspect as of migration date):
--
-- profiles (REST /api/me/profile GET select *, PATCH)
--   display_name, username, avatar_custom_json, character_class_id, starter_weapon,
--   scholar_guild_id, bio, game_state_json, onboarding_*, beginner_chain_* ,
--   streak_days, last_activity_date (among others defined in earlier migrations)
-- Hydration reads game_state_json for equipment snapshot (equippedCosmetics,
-- unlockedCosmetics, guildIds, achievements, finalBossesDefeatedCount, etc.).
--
-- Extra JSON blobs (reserved for alternate storage paths / reporting; app may keep
-- using game_state_json for loadout/stats snapshots until wired):
--   equipment_loadout_json, character_stats_json
--
-- user_stats (REST /api/me/stats GET select *, PATCH)
--   total_xp, level, strength, stamina, knowledge, social, focus,
--   bosses_defeated, updated_at (+ quests_completed elsewhere in services.ts)
--
-- Parallel columns for leaderboard / parity (final bosses also in game_state_json):
--   final_bosses_defeated, current_streak, longest_streak, streak_saves
--
-- Boss progress & inventory elsewhere: user_inventory, xp_logs, quests, etc.
-- (see MVP migrations)—not duplicated here unless column-level gaps arise.
--
-- XP/level: use existing total_xp + level columns (bigint + integer)—no duplicates.
--
-- Earlier migrations may have applied the same clauses; ADD COLUMN IF NOT EXISTS is safe.

-- -----------------------------------------------------------------------------
-- profiles
-- -----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists game_state_json jsonb not null default '{}'::jsonb,
  add column if not exists equipment_loadout_json jsonb not null default '{}'::jsonb,
  add column if not exists character_stats_json jsonb not null default '{}'::jsonb;

-- -----------------------------------------------------------------------------
-- user_stats
-- -----------------------------------------------------------------------------
alter table public.user_stats
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists total_xp bigint not null default 0 check (total_xp >= 0),
  add column if not exists level integer not null default 1 check (level >= 1),
  add column if not exists strength integer not null default 0 check (strength >= 0),
  add column if not exists stamina integer not null default 0 check (stamina >= 0),
  add column if not exists knowledge integer not null default 0 check (knowledge >= 0),
  add column if not exists social integer not null default 0 check (social >= 0),
  add column if not exists focus integer not null default 0 check (focus >= 0),
  add column if not exists quests_completed integer not null default 0 check (quests_completed >= 0),
  add column if not exists bosses_defeated integer not null default 0 check (bosses_defeated >= 0),
  add column if not exists final_bosses_defeated integer not null default 0 check (final_bosses_defeated >= 0),
  add column if not exists current_streak integer not null default 0 check (current_streak >= 0),
  add column if not exists longest_streak integer not null default 0 check (longest_streak >= 0),
  add column if not exists streak_saves integer not null default 0 check (streak_saves >= 0);
