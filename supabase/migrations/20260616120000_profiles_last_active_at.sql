-- Track authenticated app usage for pilot analytics (DAU / WAU / MAU).

alter table public.profiles
  add column if not exists last_active_at timestamptz;

create index if not exists idx_profiles_last_active_at
  on public.profiles (last_active_at desc nulls last);
