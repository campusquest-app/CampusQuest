-- Rolling weekly identity change counts (allowlisted emails use JSON event log instead of 7d/30d cooldown only).

alter table public.profiles
  add column if not exists identity_weekly_change_events jsonb not null default '[]'::jsonb;

comment on column public.profiles.identity_weekly_change_events is
  'Array of { "at": timestamptz ISO string, "k": "display" | "username" } for weekly rename budgeting.';
