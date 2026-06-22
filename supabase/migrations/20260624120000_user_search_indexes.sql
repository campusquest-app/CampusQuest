-- Speed up case-insensitive username / display name search for live user suggestions.

create extension if not exists pg_trgm;

create index if not exists idx_profiles_username_trgm
  on public.profiles using gin (username gin_trgm_ops);

create index if not exists idx_profiles_display_name_trgm
  on public.profiles using gin (display_name gin_trgm_ops);
