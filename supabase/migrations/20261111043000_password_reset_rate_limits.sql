-- Shared password-reset counters. Buckets are HMAC identifiers supplied by the
-- server. This table never stores raw email addresses or IP addresses.
-- One row per bucket is overwritten when its window expires.

create table if not exists public.password_reset_rate_limits (
  bucket text primary key check (bucket ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null,
  request_count integer not null check (request_count >= 0)
);

comment on table public.password_reset_rate_limits is
  'Password-reset request counters keyed by a server HMAC. No raw email or IP is stored.';

alter table public.password_reset_rate_limits enable row level security;

revoke all on table public.password_reset_rate_limits from public;
revoke all on table public.password_reset_rate_limits from anon;
revoke all on table public.password_reset_rate_limits from authenticated;

create or replace function public.consume_password_reset_rate_limit(
  p_bucket text,
  p_limit integer,
  p_window_seconds integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_window timestamptz;
  existing_count integer;
begin
  if p_bucket is null or p_bucket !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_rate_limit_bucket';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'invalid_rate_limit';
  end if;
  if p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'invalid_rate_limit_window';
  end if;

  -- Serializes concurrent callers on this bucket across all server instances.
  perform pg_advisory_xact_lock(hashtextextended(p_bucket, 0));

  select window_started_at, request_count
  into existing_window, existing_count
  from public.password_reset_rate_limits
  where bucket = p_bucket
  for update;

  if not found or existing_window + make_interval(secs => p_window_seconds) <= clock_timestamp() then
    insert into public.password_reset_rate_limits (bucket, window_started_at, request_count)
    values (p_bucket, clock_timestamp(), 1)
    on conflict (bucket) do update
      set window_started_at = excluded.window_started_at,
          request_count = 1;
    return true;
  end if;

  if existing_count >= p_limit then
    return false;
  end if;

  update public.password_reset_rate_limits
  set request_count = existing_count + 1
  where bucket = p_bucket;

  return true;
end;
$$;

revoke all on function public.consume_password_reset_rate_limit(text, integer, integer) from public;
revoke all on function public.consume_password_reset_rate_limit(text, integer, integer) from anon;
revoke all on function public.consume_password_reset_rate_limit(text, integer, integer) from authenticated;
grant execute on function public.consume_password_reset_rate_limit(text, integer, integer) to service_role;

comment on function public.consume_password_reset_rate_limit(text, integer, integer) is
  'Atomically counts one password-reset attempt for an HMAC bucket. Returns false when the window limit is already reached.';
