-- Optional qr_codes columns expected by /api/qr/scan (safe if 20260602120000 bootstrap was applied alone).

alter table public.qr_codes add column if not exists event_id uuid;
alter table public.qr_codes add column if not exists quest_id uuid;
alter table public.qr_codes add column if not exists requires_staff_approval boolean not null default false;
