-- Split generic Dining Hall into Butterfield + Mainfare.
-- Preserve dining-hall row for historical memories/posts/quests; hide from map UI.

insert into public.campus_locations (
  slug, name, description, category, latitude, longitude, map_x, map_y,
  marker_emoji, short_label, fantasy_name, flavor_text, major, legacy_campus_key,
  sort_order, is_builtin, is_active
) values
(
  'butterfield-dining',
  'Butterfield Dining Hall',
  'All-you-care-to-eat dining on Butterfield Road — breakfast through dinner.',
  'dining',
  41.4862,
  -71.5284,
  51,
  57,
  '🍽',
  'Butterfield',
  'Butterfield Dining Hall',
  'All-you-care-to-eat dining on Butterfield Road — breakfast through dinner.',
  true,
  null,
  1,
  true,
  true
),
(
  'mainfare-dining',
  'Mainfare Dining Hall',
  'Hope Commons dining — Mainfare stations, late plates, and campus meals.',
  'dining',
  41.4891,
  -71.5295,
  56,
  40,
  '🍽',
  'Mainfare',
  'Mainfare Dining Hall',
  'Hope Commons dining — Mainfare stations, late plates, and campus meals.',
  true,
  null,
  2,
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
  sort_order = excluded.sort_order,
  is_builtin = true,
  is_active = true,
  updated_at = now();

-- Hide generic Dining Hall from map / new selection; keep row for historical location_id refs.
update public.campus_locations
set
  is_active = false,
  major = false,
  name = 'Dining Hall (retired)',
  short_label = 'Dining Hall',
  updated_at = now()
where slug = 'dining-hall';

-- Canonical Memories / map order: Quad → Butterfield → Mainfare → Union → …
update public.campus_locations set sort_order = 0, updated_at = now() where slug = 'the-quad';
update public.campus_locations set sort_order = 1, updated_at = now() where slug = 'butterfield-dining';
update public.campus_locations set sort_order = 2, updated_at = now() where slug = 'mainfare-dining';
update public.campus_locations set sort_order = 3, updated_at = now() where slug = 'memorial-union';
update public.campus_locations set sort_order = 4, updated_at = now() where slug = 'library';
update public.campus_locations set sort_order = 5, updated_at = now() where slug = 'rec-center';
update public.campus_locations set sort_order = 6, updated_at = now() where slug = 'engineering-hall';
update public.campus_locations set sort_order = 7, updated_at = now() where slug = 'business-building';
update public.campus_locations set sort_order = 8, updated_at = now() where slug = 'rams-den';
update public.campus_locations set sort_order = 9, updated_at = now() where slug = 'weldin-hall';
update public.campus_locations set sort_order = 99, updated_at = now() where slug = 'dining-hall';

-- Re-point aliases: Butterfield-specific
insert into public.campus_location_aliases (normalized_alias, campus_location_slug)
select distinct
  lower(regexp_replace(regexp_replace(trim(alias_text), '\s+', ' ', 'g'), '[^a-z0-9 ]', '', 'g')),
  'butterfield-dining'
from unnest(array[
  'Butterfield',
  'Butterfield Dining',
  'Butterfield Dining Hall',
  'Butterfield Hall',
  'URI Butterfield'
]) as alias_text
where coalesce(trim(alias_text), '') <> ''
on conflict (normalized_alias) do update
set campus_location_slug = excluded.campus_location_slug;

-- Mainfare / Hope Commons
insert into public.campus_location_aliases (normalized_alias, campus_location_slug)
select distinct
  lower(regexp_replace(regexp_replace(trim(alias_text), '\s+', ' ', 'g'), '[^a-z0-9 ]', '', 'g')),
  'mainfare-dining'
from unnest(array[
  'Mainfare',
  'Mainfare Dining',
  'Mainfare Dining Hall',
  'Hope Commons',
  'Hope Commons Mainfare',
  'Hope Dining Hall',
  'URI Mainfare'
]) as alias_text
where coalesce(trim(alias_text), '') <> ''
on conflict (normalized_alias) do update
set campus_location_slug = excluded.campus_location_slug;

-- Generic dining aliases should no longer force a single hall.
-- Keep them attached to the retired slug for historical lookup only.
insert into public.campus_location_aliases (normalized_alias, campus_location_slug)
select distinct
  lower(regexp_replace(regexp_replace(trim(alias_text), '\s+', ' ', 'g'), '[^a-z0-9 ]', '', 'g')),
  'dining-hall'
from unnest(array[
  'Dining Hall',
  'dining hall',
  'uri dining hall',
  'campus dining'
]) as alias_text
where coalesce(trim(alias_text), '') <> ''
on conflict (normalized_alias) do update
set campus_location_slug = excluded.campus_location_slug;
