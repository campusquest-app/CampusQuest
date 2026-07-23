-- Display preference: Level/XP/Streak top bar (default hidden).
-- Idempotent: safe to re-run.

alter table public.profiles
  add column if not exists show_xp_progress_bar boolean not null default false;

comment on column public.profiles.show_xp_progress_bar is
  'When true, show Level/XP/Streak progress bar in the top nav. Default off.';
