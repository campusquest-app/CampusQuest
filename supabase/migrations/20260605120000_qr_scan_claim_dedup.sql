-- Prevent duplicate QR claims from concurrent scan requests (same user + code + UTC day).
alter table public.qr_scans
  add column if not exists claim_utc_day date,
  add column if not exists idempotency_key text;

create unique index if not exists qr_scans_idempotency_key_uidx
  on public.qr_scans (idempotency_key)
  where idempotency_key is not null;

create unique index if not exists qr_scans_user_code_day_claim_uidx
  on public.qr_scans (user_id, qr_code_id, claim_utc_day)
  where status in ('success', 'admin_bypass')
    and claim_utc_day is not null;
