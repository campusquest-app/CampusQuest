-- Allow logging invalid QR scans without a matching location row
alter table public.qr_scan_logs
  alter column quest_location_id drop not null;

