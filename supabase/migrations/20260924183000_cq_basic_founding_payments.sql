-- CQ Basic founding-pass payment audit.
--
-- Additive only. Creates cq_basic_payments and one service-role function.
-- Applying this file does not update or delete profiles, events, or existing
-- access rows. The function writes cq_basic_access only when a later verified
-- payment calls it.
--
-- A checkout session is stored once. Replaying that session returns the
-- original 60-day window and does not extend it. A second paid session does
-- not replace an access window that was already applied.

create table if not exists public.cq_basic_payments (
  checkout_session_id text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  payment_intent_id text,
  amount integer not null,
  currency text not null,
  status text not null,
  paid_at timestamptz,
  access_starts_at timestamptz,
  access_ends_at timestamptz,
  applied boolean not null default false,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint cq_basic_payments_amount check (amount = 500),
  constraint cq_basic_payments_currency check (currency = 'usd'),
  constraint cq_basic_payments_status check (status in ('paid', 'failed')),
  constraint cq_basic_payments_paid_shape check (
    (status = 'paid' and paid_at is not null and access_starts_at is not null and access_ends_at is not null)
    or (status = 'failed' and applied = false)
  )
);

create unique index if not exists cq_basic_payments_payment_intent
  on public.cq_basic_payments (payment_intent_id)
  where payment_intent_id is not null;

create unique index if not exists cq_basic_payments_one_applied_grant
  on public.cq_basic_payments (user_id)
  where applied = true;

alter table public.cq_basic_payments enable row level security;

revoke all on table public.cq_basic_payments from public;
revoke all on table public.cq_basic_payments from anon;
revoke all on table public.cq_basic_payments from authenticated;

create or replace function public.apply_cq_basic_founding_payment(
  p_user_id uuid,
  p_checkout_session_id text,
  p_payment_intent_id text,
  p_amount integer,
  p_currency text,
  p_paid_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.cq_basic_payments%rowtype;
  v_starts timestamptz;
  v_ends timestamptz;
begin
  if p_amount is distinct from 500 or lower(p_currency) is distinct from 'usd' then
    raise exception 'founding payment amount is not the test price';
  end if;
  if p_checkout_session_id is null or char_length(p_checkout_session_id) < 8 then
    raise exception 'founding payment is missing a checkout session';
  end if;
  if p_paid_at is null then
    raise exception 'founding payment is missing a payment time';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  v_starts := p_paid_at;
  v_ends := p_paid_at + interval '60 days';

  insert into public.cq_basic_payments (
    checkout_session_id,
    user_id,
    payment_intent_id,
    amount,
    currency,
    status,
    paid_at,
    access_starts_at,
    access_ends_at,
    applied
  ) values (
    p_checkout_session_id,
    p_user_id,
    nullif(p_payment_intent_id, ''),
    p_amount,
    lower(p_currency),
    'paid',
    p_paid_at,
    v_starts,
    v_ends,
    false
  )
  on conflict (checkout_session_id) do nothing;

  select * into v_row
  from public.cq_basic_payments
  where checkout_session_id = p_checkout_session_id
  for update;

  if v_row.user_id is distinct from p_user_id or v_row.status is distinct from 'paid' then
    raise exception 'founding payment owner does not match';
  end if;

  if v_row.applied then
    return jsonb_build_object(
      'applied', false,
      'duplicate', true,
      'starts_at', v_row.access_starts_at,
      'ends_at', v_row.access_ends_at
    );
  end if;

  if exists (
    select 1
    from public.cq_basic_payments prior
    where prior.user_id = p_user_id
      and prior.applied
      and prior.checkout_session_id <> p_checkout_session_id
  ) then
    update public.cq_basic_payments
    set processed_at = now()
    where checkout_session_id = p_checkout_session_id;
    return jsonb_build_object('applied', false, 'duplicate', true);
  end if;

  insert into public.cq_basic_access (user_id, starts_at, ends_at, early_access)
  values (p_user_id, v_row.access_starts_at, v_row.access_ends_at, true)
  on conflict (user_id) do update
  set starts_at = excluded.starts_at,
      ends_at = excluded.ends_at,
      early_access = true
  where public.cq_basic_access.starts_at is distinct from excluded.starts_at
     or public.cq_basic_access.ends_at is distinct from excluded.ends_at
     or public.cq_basic_access.early_access is distinct from true;

  update public.cq_basic_payments
  set applied = true,
      processed_at = now()
  where checkout_session_id = p_checkout_session_id;

  return jsonb_build_object(
    'applied', true,
    'duplicate', false,
    'starts_at', v_row.access_starts_at,
    'ends_at', v_row.access_ends_at
  );
end;
$$;

revoke all on function public.apply_cq_basic_founding_payment(uuid, text, text, integer, text, timestamptz) from public;
revoke all on function public.apply_cq_basic_founding_payment(uuid, text, text, integer, text, timestamptz) from anon;
revoke all on function public.apply_cq_basic_founding_payment(uuid, text, text, integer, text, timestamptz) from authenticated;
grant execute on function public.apply_cq_basic_founding_payment(uuid, text, text, integer, text, timestamptz) to service_role;

comment on table public.cq_basic_payments is
  'Audit of CQ Basic founding Checkout sessions. Clients cannot read or write it. Replay of a paid session does not extend access.';
