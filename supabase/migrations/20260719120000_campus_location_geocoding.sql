-- Geocoding + verified building registry fields for shared campus locations.
alter table public.campus_locations
  add column if not exists google_place_id text,
  add column if not exists formatted_address text,
  add column if not exists verified boolean not null default false,
  add column if not exists aliases text[] not null default '{}',
  add column if not exists geocode_source text;

-- Resolution audit trail for URInvolved event placements.
alter table public.external_event_map_overrides
  add column if not exists google_place_id text,
  add column if not exists formatted_address text,
  add column if not exists resolution_debug jsonb,
  add column if not exists manually_verified boolean not null default false;

alter table public.external_event_map_overrides
  drop constraint if exists external_event_map_overrides_match_status_check;

alter table public.external_event_map_overrides
  add constraint external_event_map_overrides_match_status_check
  check (
    match_status in (
      'auto_matched',
      'manually_adjusted',
      'verified',
      'needs_review',
      'unmatched',
      'hidden',
      'ignored'
    )
  );

-- Seed Weldin Hall with registry row (coords updated by Google on first resolve).
insert into public.campus_locations (
  slug, name, description, category, latitude, longitude, map_x, map_y,
  marker_emoji, short_label, major, aliases, sort_order, is_builtin, is_active, geocode_source
) values (
  'weldin-hall',
  'Weldin Hall',
  'Performing arts and student gathering spaces on the Kingston campus.',
  'building',
  41.4908,
  -71.5294,
  55,
  44,
  '🏛',
  'Weldin',
  true,
  array['weldin hall first floor lounge', 'weldin hall lounge', 'weldin'],
  7,
  false,
  true,
  'seed'
)
on conflict (slug) do update set
  name = excluded.name,
  aliases = excluded.aliases,
  latitude = coalesce(public.campus_locations.latitude, excluded.latitude),
  longitude = coalesce(public.campus_locations.longitude, excluded.longitude),
  updated_at = now();
