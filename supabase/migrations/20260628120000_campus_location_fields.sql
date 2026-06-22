-- Campus location fields for QR codes and admin quests (map pins).

alter table public.qr_codes
  add column if not exists location_key text,
  add column if not exists location_address text,
  add column if not exists location_lat double precision,
  add column if not exists location_lng double precision;

alter table public.admin_quests
  add column if not exists location_key text,
  add column if not exists location_address text;

comment on column public.qr_codes.location_key is 'Preset campus location key (quad, library, memorial_union, other, etc.)';
comment on column public.qr_codes.location_address is 'Human-readable campus address for QR location';
