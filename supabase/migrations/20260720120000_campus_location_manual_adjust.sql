-- Protect admin-adjusted campus location coordinates from automatic geocode overwrites.
alter table public.campus_locations
  add column if not exists manually_adjusted boolean not null default false;

-- Weldin Hall aliases: common misspellings and short forms map to one canonical location.
update public.campus_locations
set
  aliases = array(
    select distinct unnest(
      coalesce(aliases, '{}'::text[]) || array[
        'weldin hall first floor lounge',
        'weldin hall lounge',
        'weldin',
        'weldon hall',
        'weldon'
      ]
    )
  ),
  updated_at = now()
where slug = 'weldin-hall';
