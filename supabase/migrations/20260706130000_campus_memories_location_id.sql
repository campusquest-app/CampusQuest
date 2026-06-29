-- Unify campus_memories with Realm location ids (canonical location_id).

alter table public.campus_memories
  add column if not exists location_id text;

-- Backfill canonical Realm location ids from legacy location_key values.
update public.campus_memories
set location_id = case location_key
  when 'quad' then 'the-quad'
  when 'library' then 'library'
  when 'memorial_union' then 'memorial-union'
  when 'mackal_rec_center' then 'rec-center'
  when 'academic_building' then 'engineering-hall'
  when 'dining_hall' then 'rams-den'
  when 'ryan_center' then 'rams-den'
  else location_key
end
where location_id is null or location_id = '';

-- Sync display name from canonical registry labels where we can infer id.
update public.campus_memories cm
set location_name = case cm.location_id
  when 'the-quad' then 'The Quad'
  when 'library' then 'Library'
  when 'memorial-union' then 'Memorial Union'
  when 'rec-center' then 'Rec Center'
  when 'engineering-hall' then 'Engineering Hall'
  when 'business-building' then 'Business Building'
  when 'rams-den' then 'Rams Den'
  else cm.location_name
end
where cm.location_id in (
  'the-quad', 'library', 'memorial-union', 'rec-center',
  'engineering-hall', 'business-building', 'rams-den'
);

create index if not exists idx_campus_memories_location_id_active
  on public.campus_memories (location_id, expires_at desc);

create index if not exists idx_campus_memories_location_id_saved
  on public.campus_memories (location_id, saved_to_profile, created_at desc)
  where saved_to_profile = true;

comment on column public.campus_memories.location_id is
  'Canonical Realm campus location id (the-quad, library, memorial-union, etc.). Single source of truth for map + Quad Memories.';
