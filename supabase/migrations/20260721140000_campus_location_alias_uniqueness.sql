-- Canonical campus-location identity:
-- 1) unique normalized aliases (one alias → one building)
-- 2) expand Weldin aliases
-- 3) reattach misplaced event overrides onto campus landmarks

-- ---------------------------------------------------------------------------
-- Unique alias index table
-- ---------------------------------------------------------------------------
create table if not exists public.campus_location_aliases (
  normalized_alias text primary key,
  campus_location_slug text not null references public.campus_locations (slug) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_campus_location_aliases_slug
  on public.campus_location_aliases (campus_location_slug);

alter table public.campus_location_aliases enable row level security;

drop policy if exists campus_location_aliases_public_read on public.campus_location_aliases;
create policy campus_location_aliases_public_read
  on public.campus_location_aliases for select
  to authenticated, anon
  using (true);

drop policy if exists campus_location_aliases_admin_all on public.campus_location_aliases;
create policy campus_location_aliases_admin_all
  on public.campus_location_aliases for all
  to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin', 'super_admin')
  ))
  with check (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin', 'super_admin')
  ));

drop policy if exists campus_location_aliases_service_role on public.campus_location_aliases;
create policy campus_location_aliases_service_role
  on public.campus_location_aliases for all
  to service_role
  using (true)
  with check (true);

-- Rebuild alias index from campus_locations name + aliases (+ slug words).
truncate public.campus_location_aliases;

insert into public.campus_location_aliases (normalized_alias, campus_location_slug)
select distinct
  lower(regexp_replace(regexp_replace(trim(alias_text), '\s+', ' ', 'g'), '[^a-z0-9 ]', '', 'g')),
  loc.slug
from public.campus_locations loc
cross join lateral unnest(
  array[
    loc.name,
    replace(loc.slug, '-', ' ')
  ] || coalesce(loc.aliases, '{}'::text[])
) as alias_text
where loc.is_active = true
  and coalesce(trim(alias_text), '') <> ''
on conflict (normalized_alias) do nothing;

-- ---------------------------------------------------------------------------
-- Weldin Hall: keep verified coords, expand lounge aliases
-- ---------------------------------------------------------------------------
update public.campus_locations
set
  aliases = array(
    select distinct unnest(
      coalesce(aliases, '{}'::text[]) || array[
        'weldin hall first floor lounge',
        'weldin hall lounge',
        'weldin lounge',
        'weldin',
        'weldon hall',
        'weldon',
        'weldin basketball court'
      ]
    )
  ),
  verified = true,
  updated_at = now()
where slug = 'weldin-hall';

insert into public.campus_location_aliases (normalized_alias, campus_location_slug)
select v.alias, 'weldin-hall'
from (
  values
    ('weldin hall'),
    ('weldin hall first floor lounge'),
    ('weldin hall lounge'),
    ('weldin lounge'),
    ('weldin'),
    ('weldon hall'),
    ('weldon'),
    ('weldin basketball court')
) as v(alias)
on conflict (normalized_alias) do update
set campus_location_slug = excluded.campus_location_slug;

-- ---------------------------------------------------------------------------
-- Reconcile event overrides: attach building-matched events to landmarks.
-- Clears custom_lat/lng so map grouping uses landmark coordinates.
-- ---------------------------------------------------------------------------
update public.external_event_map_overrides o
set
  realm_location_id = a.campus_location_slug,
  custom_lat = null,
  custom_lng = null,
  custom_label = loc.name,
  match_status = case
    when o.match_status in ('hidden', 'ignored', 'online', 'invalid') then o.match_status
    else 'resolved'
  end,
  match_reason = 'reconcile_canonical_campus_location',
  normalized_location_text = coalesce(o.normalized_location_text, a.normalized_alias),
  updated_at = now()
from public.campus_location_aliases a
join public.campus_locations loc on loc.slug = a.campus_location_slug
where o.match_status not in ('hidden', 'ignored', 'online')
  and (
    lower(regexp_replace(regexp_replace(trim(coalesce(o.raw_location_text, '')), '\s+', ' ', 'g'), '[^a-z0-9 ]', '', 'g'))
      = a.normalized_alias
    or lower(regexp_replace(regexp_replace(trim(coalesce(o.raw_location_text, '')), '\s+', ' ', 'g'), '[^a-z0-9 ]', '', 'g'))
      like a.normalized_alias || ' %'
    or a.normalized_alias = any (
      select lower(regexp_replace(regexp_replace(trim(x), '\s+', ' ', 'g'), '[^a-z0-9 ]', '', 'g'))
      from unnest(
        string_to_array(coalesce(o.raw_location_text, ''), ',')
      ) as x
    )
  );

-- Explicit Weldin lounge variants (room-level text → weldin-hall).
update public.external_event_map_overrides o
set
  realm_location_id = 'weldin-hall',
  custom_lat = null,
  custom_lng = null,
  custom_label = 'Weldin Hall',
  match_status = case
    when o.match_status in ('hidden', 'ignored', 'online', 'invalid') then o.match_status
    else 'resolved'
  end,
  match_reason = 'reconcile_weldin_canonical',
  normalized_location_text = 'weldin hall',
  updated_at = now()
where o.match_status not in ('hidden', 'ignored', 'online')
  and (
    o.raw_location_text ilike '%weldin%'
    or o.raw_location_text ilike '%weldon%'
    or o.normalized_location_text ilike '%weldin%'
    or o.realm_location_id = 'weldin-hall'
  );

-- Align event-row lat/lng with the canonical Weldin landmark.
update public.external_events e
set
  latitude = loc.latitude,
  longitude = loc.longitude,
  updated_at = now()
from public.external_event_map_overrides o
join public.campus_locations loc on loc.slug = o.realm_location_id
where e.id = o.external_event_id
  and o.realm_location_id = 'weldin-hall'
  and loc.latitude is not null
  and loc.longitude is not null;
