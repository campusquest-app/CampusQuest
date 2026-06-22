-- Remove seeded/demo/test guilds that were inserted for development.
-- Legitimate user-created guilds are not matched by these patterns.

delete from public.guilds
where lower(trim(name)) in (
  'library legends',
  'all-nighter squad',
  'ram runners',
  'keaney fit',
  'career quest',
  'linkedin rams',
  'quad squad',
  'campus crew',
  'demo guild',
  'test guild',
  'example guild',
  'placeholder guild',
  'super guild'
)
or lower(trim(name)) like 'demo %guild%'
or lower(trim(name)) like 'test %guild%'
or lower(trim(name)) like 'example %guild%'
or lower(trim(name)) like 'placeholder %guild%';
