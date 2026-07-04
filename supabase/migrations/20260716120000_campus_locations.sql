-- Shared campus location catalog (Realm map pins, memories, quests, QR, events).
create table if not exists public.campus_locations (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null check (char_length(slug) between 2 and 64),
  name text not null check (char_length(trim(name)) between 2 and 120),
  description text not null default '' check (char_length(description) <= 500),
  category text not null default 'building' check (
    category in ('building', 'landmark', 'dining', 'recreation', 'academic', 'other')
  ),
  latitude double precision,
  longitude double precision,
  map_x double precision check (map_x is null or (map_x >= 0 and map_x <= 100)),
  map_y double precision check (map_y is null or (map_y >= 0 and map_y <= 100)),
  marker_emoji text not null default '📍',
  short_label text,
  fantasy_name text,
  flavor_text text,
  major boolean not null default true,
  legacy_campus_key text,
  sort_order integer not null default 0,
  is_builtin boolean not null default false,
  is_active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_campus_locations_active
  on public.campus_locations (is_active, sort_order, name)
  where is_active = true;

create index if not exists idx_campus_locations_slug
  on public.campus_locations (slug);

alter table public.campus_locations enable row level security;

drop policy if exists campus_locations_select_authenticated on public.campus_locations;
create policy campus_locations_select_authenticated
  on public.campus_locations for select
  to authenticated
  using (is_active = true or exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin', 'super_admin')
  ));

drop policy if exists campus_locations_admin_write on public.campus_locations;
create policy campus_locations_admin_write
  on public.campus_locations for all
  to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin', 'super_admin')
  ))
  with check (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin', 'super_admin')
  ));

-- Backfill built-in Realm landmarks (idempotent by slug).
insert into public.campus_locations (
  slug, name, description, category, latitude, longitude, map_x, map_y,
  marker_emoji, short_label, fantasy_name, flavor_text, major, legacy_campus_key,
  sort_order, is_builtin, is_active
) values
  ('memorial-union', 'Memorial Union', 'Guild banners hang where Rams gather between quests.', 'landmark', 41.4868, -71.5301, 47, 54, '🏛', 'Union', 'Grand Adventurer''s Guild Hall', 'Guild banners hang where Rams gather between quests.', true, 'memorial_union', 0, true, true),
  ('library', 'Library', 'Ancient tomes whisper secrets left by Rams who studied here.', 'academic', 41.4876, -71.5312, 44, 46, '📚', 'Library', 'Arcane Knowledge Archive', 'Ancient tomes whisper secrets left by Rams who studied here.', true, 'library', 1, true, true),
  ('rec-center', 'Rec Center', 'Steel your body before the next campus campaign.', 'recreation', 41.4849, -71.5288, 52, 62, '🏋', 'Rec Center', 'Warrior Training Grounds', 'Steel your body before the next campus campaign.', true, 'mackal_rec_center', 2, true, true),
  ('engineering-hall', 'Engineering Hall', 'Gears turn and prototypes spark under inventor''s lamps.', 'academic', 41.4888, -71.5295, 58, 38, '⚙', 'Engineering', 'Inventor''s District', 'Gears turn and prototypes spark under inventor''s lamps.', false, 'academic_building', 3, true, true),
  ('business-building', 'Business Building', 'Deals are struck and networks forged in merchant halls.', 'academic', 41.4892, -71.5282, 62, 42, '🏢', 'Business', 'Merchant''s Quarter', 'Deals are struck and networks forged in merchant halls.', false, null, 4, true, true),
  ('the-quad', 'The Quad', 'The heart of the kingdom — every campus path leads here.', 'landmark', 41.4871, -71.5305, 46, 50, '✨', 'The Quad', 'Central Kingdom Green', 'The heart of the kingdom — every campus path leads here.', true, 'quad', 5, true, true),
  ('rams-den', 'Rams Den', 'Stories and cheers echo from the tavern hearth.', 'dining', 41.4862, -71.5318, 49, 56, '🐏', 'Rams Den', 'Rams Den Tavern', 'Stories and cheers echo from the tavern hearth.', false, 'dining_hall', 6, true, true)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  latitude = excluded.latitude,
  longitude = excluded.longitude,
  map_x = excluded.map_x,
  map_y = excluded.map_y,
  marker_emoji = excluded.marker_emoji,
  short_label = excluded.short_label,
  fantasy_name = excluded.fantasy_name,
  flavor_text = excluded.flavor_text,
  major = excluded.major,
  legacy_campus_key = excluded.legacy_campus_key,
  sort_order = excluded.sort_order,
  is_builtin = true,
  updated_at = now();
