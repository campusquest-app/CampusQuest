-- QR code custom uploads, persisted PNGs, and scheduling.

alter table public.qr_codes
  add column if not exists image_url text,
  add column if not exists qr_png_url text,
  add column if not exists starts_at timestamptz,
  add column if not exists updated_at timestamptz default now();

create or replace function public.set_qr_codes_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_qr_codes_updated_at on public.qr_codes;
create trigger trg_qr_codes_updated_at
before update on public.qr_codes
for each row execute function public.set_qr_codes_updated_at();

insert into storage.buckets (id, name, public)
values ('qr-code-images', 'qr-code-images', true)
on conflict (id) do update set public = excluded.public;
