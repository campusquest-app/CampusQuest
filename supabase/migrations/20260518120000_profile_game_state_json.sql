-- Flexible UI/character snapshot (equipped cosmetics, achievements slice, etc.).
-- Idempotent: safe if an earlier migration already added this column.

alter table public.profiles
  add column if not exists game_state_json jsonb not null default '{}'::jsonb;
