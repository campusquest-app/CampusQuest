-- Track when display name / username last changed for client cooldown UX and API enforcement.

alter table public.profiles
  add column if not exists display_name_changed_at timestamptz;

alter table public.profiles
  add column if not exists username_changed_at timestamptz;
