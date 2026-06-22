-- Admin QR payload columns (quest builder + flexible qr_type).

alter table public.qr_codes add column if not exists qr_type text default 'general';
alter table public.qr_codes add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.qr_codes add column if not exists admin_quest_id uuid;

alter table public.qr_codes drop constraint if exists qr_codes_type_check;
alter table public.qr_codes add constraint qr_codes_type_check check (
  type in (
    'event',
    'quest',
    'permanent_location',
    'tutoring',
    'advising',
    'reward',
    'general'
  )
);

alter table public.qr_codes drop constraint if exists qr_codes_qr_type_check;
alter table public.qr_codes add constraint qr_codes_qr_type_check check (
  qr_type is null
  or qr_type in (
    'quest_completion',
    'event_check_in',
    'location_check_in',
    'reward',
    'general'
  )
);

comment on column public.qr_codes.qr_type is 'Semantic admin QR category';
comment on column public.qr_codes.metadata is 'Optional JSON metadata from admin flows';
