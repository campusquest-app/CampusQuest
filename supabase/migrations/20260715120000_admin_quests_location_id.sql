-- Canonical Realm location id for admin quests (matches campus_memories.location_id).
alter table public.admin_quests
  add column if not exists location_id text;

-- Backfill from legacy location_key (preset keys + canonical ids stored as key).
update public.admin_quests
set location_id = case location_key
  when 'quad' then 'the-quad'
  when 'library' then 'library'
  when 'memorial_union' then 'memorial-union'
  when 'mackal_rec_center' then 'rec-center'
  when 'academic_building' then 'engineering-hall'
  when 'dining_hall' then 'rams-den'
  when 'ryan_center' then 'rams-den'
  when 'the-quad' then 'the-quad'
  when 'memorial-union' then 'memorial-union'
  when 'rec-center' then 'rec-center'
  when 'engineering-hall' then 'engineering-hall'
  when 'business-building' then 'business-building'
  when 'rams-den' then 'rams-den'
  else location_id
end
where (location_id is null or location_id = '')
  and location_key is not null;

create index if not exists idx_admin_quests_location_id
  on public.admin_quests (location_id)
  where location_id is not null and deleted_at is null;

comment on column public.admin_quests.location_id is
  'Canonical Realm map location id (same ids as campus_memories.location_id).';
