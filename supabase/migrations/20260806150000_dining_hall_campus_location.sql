-- Permanent Dining Hall campus location for Memories / Realm / quests.
-- Ordered after The Quad and before Memorial Union (Union).

-- Free the dining_hall legacy key before assigning it to Dining Hall.
update public.campus_locations
set legacy_campus_key = null,
    updated_at = now()
where slug = 'rams-den'
  and legacy_campus_key = 'dining_hall';

insert into public.campus_locations (
  slug, name, description, category, latitude, longitude, map_x, map_y,
  marker_emoji, short_label, fantasy_name, flavor_text, major, legacy_campus_key,
  sort_order, is_builtin, is_active
) values (
  'dining-hall',
  'Dining Hall',
  'Trays clatter and rumors travel faster than the dinner line.',
  'dining',
  41.4855,
  -71.5275,
  51,
  58,
  '🍽',
  'Dining Hall',
  'Feast Hall of the Realm',
  'Trays clatter and rumors travel faster than the dinner line.',
  true,
  'dining_hall',
  1,
  true,
  true
)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  latitude = coalesce(public.campus_locations.latitude, excluded.latitude),
  longitude = coalesce(public.campus_locations.longitude, excluded.longitude),
  map_x = coalesce(public.campus_locations.map_x, excluded.map_x),
  map_y = coalesce(public.campus_locations.map_y, excluded.map_y),
  marker_emoji = excluded.marker_emoji,
  short_label = excluded.short_label,
  fantasy_name = excluded.fantasy_name,
  flavor_text = excluded.flavor_text,
  major = true,
  legacy_campus_key = excluded.legacy_campus_key,
  sort_order = excluded.sort_order,
  is_builtin = true,
  is_active = true,
  updated_at = now();

-- Canonical Memories row order: Quad → Dining Hall → Union, then the rest.
update public.campus_locations set sort_order = 0, updated_at = now() where slug = 'the-quad';
update public.campus_locations set sort_order = 1, updated_at = now() where slug = 'dining-hall';
update public.campus_locations set sort_order = 2, updated_at = now() where slug = 'memorial-union';
update public.campus_locations set sort_order = 3, updated_at = now() where slug = 'library';
update public.campus_locations set sort_order = 4, updated_at = now() where slug = 'rec-center';
update public.campus_locations set sort_order = 5, updated_at = now() where slug = 'engineering-hall';
update public.campus_locations set sort_order = 6, updated_at = now() where slug = 'business-building';
update public.campus_locations set sort_order = 7, updated_at = now() where slug = 'rams-den';
update public.campus_locations set sort_order = 8, updated_at = now() where slug = 'weldin-hall';

-- Index Dining Hall aliases for event / memory location matching.
insert into public.campus_location_aliases (normalized_alias, campus_location_slug)
select distinct
  lower(regexp_replace(regexp_replace(trim(alias_text), '\s+', ' ', 'g'), '[^a-z0-9 ]', '', 'g')),
  'dining-hall'
from unnest(array[
  'Dining Hall',
  'dining hall',
  'hope dining hall',
  'butterfield dining',
  'butterfield dining hall',
  'uri dining hall',
  'campus dining'
]) as alias_text
where coalesce(trim(alias_text), '') <> ''
on conflict (normalized_alias) do update
set campus_location_slug = excluded.campus_location_slug;
