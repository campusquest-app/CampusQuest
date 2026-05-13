-- Persist client gameplay metadata (equipment, achievements slice, etc.) for cross-session restore.

alter table public.profiles
  add column if not exists game_state_json jsonb not null default '{}'::jsonb;
