-- Founding Club representative claims and organization entitlement.
--
-- Claims are reviewed by a CampusQuest admin. Approval writes
-- organization_members, which already controls organization management.
-- Payment never writes that table.
--
-- Applying this file does not grant access or approve any claim.

alter table public.student_organizations
  add column if not exists external_organization_id uuid references public.external_organizations(id) on delete set null;

create unique index if not exists student_organizations_external_organization_id_uidx
  on public.student_organizations (external_organization_id)
  where external_organization_id is not null;

create table if not exists public.organization_representative_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid not null references public.external_organizations(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  note text check (note is null or char_length(note) <= 500),
  review_note text check (review_note is null or char_length(review_note) <= 1000),
  contact_email text not null check (char_length(contact_email) between 3 and 320),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists organization_representative_claims_one_pending
  on public.organization_representative_claims (user_id, organization_id)
  where status = 'pending';

create index if not exists organization_representative_claims_status_submitted
  on public.organization_representative_claims (status, submitted_at desc);

alter table public.organization_representative_claims enable row level security;

revoke all on table public.organization_representative_claims from anon;

drop policy if exists "representative claims read own" on public.organization_representative_claims;
create policy "representative claims read own"
on public.organization_representative_claims for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "representative claims insert own pending" on public.organization_representative_claims;
create policy "representative claims insert own pending"
on public.organization_representative_claims for insert
to authenticated
with check (
  user_id = auth.uid()
  and status = 'pending'
  and reviewed_at is null
  and reviewed_by is null
);

create or replace function public.protect_representative_claim()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' and coalesce(auth.role(), '') is distinct from 'service_role' then
    new.status := 'pending';
    new.reviewed_at := null;
    new.reviewed_by := null;
    new.submitted_at := now();
  end if;
  if tg_op = 'UPDATE' and coalesce(auth.role(), '') is distinct from 'service_role' then
    raise exception 'representative claims cannot be self-reviewed';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_representative_claim on public.organization_representative_claims;
create trigger trg_protect_representative_claim
before insert or update on public.organization_representative_claims
for each row execute function public.protect_representative_claim();

create or replace function public.protect_organization_representative_role()
returns trigger
language plpgsql
as $$
declare
  elevated boolean;
  was_elevated boolean;
begin
  if coalesce(auth.role(), '') in ('service_role', 'postgres') then
    return new;
  end if;
  elevated := coalesce(new.org_role, '') in ('owner', 'admin')
    or coalesce(new.role, '') in ('manager', 'owner', 'admin');
  if tg_op = 'INSERT' and elevated then
    raise exception 'organization representative status cannot be self-assigned';
  end if;
  if tg_op = 'UPDATE' then
    was_elevated := coalesce(old.org_role, '') in ('owner', 'admin')
      or coalesce(old.role, '') in ('manager', 'owner', 'admin');
    if elevated and not was_elevated then
      raise exception 'organization representative status cannot be self-assigned';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_organization_representative_role on public.organization_members;
create trigger trg_protect_organization_representative_role
before insert or update on public.organization_members
for each row execute function public.protect_organization_representative_role();

create or replace function public.review_organization_representative_claim(
  p_claim_id uuid,
  p_reviewer_id uuid,
  p_decision text,
  p_review_note text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.organization_representative_claims%rowtype;
  v_org public.external_organizations%rowtype;
  v_student_id uuid;
  v_role text;
  v_note text;
begin
  if p_decision not in ('approved', 'rejected') then
    raise exception 'representative review decision is invalid';
  end if;
  if p_reviewer_id is null then
    raise exception 'representative review requires an admin';
  end if;

  select * into r
  from public.organization_representative_claims
  where id = p_claim_id
  for update;

  if not found then
    raise exception 'representative claim was not found';
  end if;
  if r.status <> 'pending' then
    raise exception 'representative claim is not pending';
  end if;
  if r.user_id = p_reviewer_id then
    raise exception 'representative claim cannot be self-reviewed';
  end if;

  v_note := nullif(left(trim(coalesce(p_review_note, '')), 1000), '');

  if p_decision = 'rejected' then
    update public.organization_representative_claims
    set status = 'rejected',
        review_note = v_note,
        reviewed_at = now(),
        reviewed_by = p_reviewer_id,
        updated_at = now()
    where id = p_claim_id;
    return null;
  end if;

  select * into v_org
  from public.external_organizations
  where id = r.organization_id
    and is_active = true;

  if not found then
    raise exception 'organization was not found';
  end if;

  select id into v_student_id
  from public.student_organizations
  where external_organization_id = r.organization_id;

  if v_student_id is null then
    insert into public.student_organizations (
      name,
      description,
      category,
      school_name,
      school_domain,
      created_by,
      is_approved,
      external_organization_id
    ) values (
      left(trim(v_org.name), 120),
      left(coalesce(v_org.description, ''), 2000),
      case
        when char_length(trim(coalesce(v_org.category, ''))) between 2 and 80 then trim(v_org.category)
        else 'Student organization'
      end,
      'University of Rhode Island',
      'uri.edu',
      r.user_id,
      true,
      r.organization_id
    )
    returning id into v_student_id;
  end if;

  if exists (
    select 1
    from public.organization_members m
    where m.organization_id = v_student_id
      and m.status = 'approved'
      and m.org_role = 'owner'
      and m.user_id <> r.user_id
  ) then
    v_role := 'admin';
  else
    v_role := 'owner';
  end if;

  insert into public.organization_members (
    organization_id,
    user_id,
    role,
    org_role,
    membership_kind,
    status
  ) values (
    v_student_id,
    r.user_id,
    'manager',
    v_role,
    'member',
    'approved'
  )
  on conflict (organization_id, user_id) do update
  set role = 'manager',
      org_role = excluded.org_role,
      membership_kind = 'member',
      status = 'approved',
      updated_at = now();

  update public.organization_representative_claims
  set status = 'approved',
      review_note = v_note,
      reviewed_at = now(),
      reviewed_by = p_reviewer_id,
      updated_at = now()
  where id = p_claim_id;

  return v_student_id;
end;
$$;

revoke all on function public.review_organization_representative_claim(uuid, uuid, text, text) from public;
revoke all on function public.review_organization_representative_claim(uuid, uuid, text, text) from anon;
revoke all on function public.review_organization_representative_claim(uuid, uuid, text, text) from authenticated;
grant execute on function public.review_organization_representative_claim(uuid, uuid, text, text) to service_role;

create table if not exists public.cq_club_founding_payments (
  checkout_session_id text primary key,
  organization_id uuid not null references public.external_organizations(id) on delete cascade,
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
  constraint cq_club_founding_payments_amount check (amount = 9900),
  constraint cq_club_founding_payments_currency check (currency = 'usd'),
  constraint cq_club_founding_payments_status check (status in ('paid', 'failed')),
  constraint cq_club_founding_payments_paid_shape check (
    (status = 'paid' and paid_at is not null and access_starts_at is not null and access_ends_at is not null)
    or (status = 'failed' and applied = false)
  )
);

create unique index if not exists cq_club_founding_payments_payment_intent
  on public.cq_club_founding_payments (payment_intent_id)
  where payment_intent_id is not null;

create table if not exists public.cq_club_founding_access (
  organization_id uuid primary key references public.external_organizations(id) on delete cascade,
  purchased_by_user_id uuid not null references public.profiles(id) on delete restrict,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  checkout_session_id text,
  payment_intent_id text,
  amount integer not null,
  currency text not null,
  status text not null check (status in ('active', 'expired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cq_club_founding_access_window check (ends_at > starts_at),
  constraint cq_club_founding_access_amount check (amount = 9900),
  constraint cq_club_founding_access_currency check (currency = 'usd')
);

alter table public.cq_club_founding_payments enable row level security;
alter table public.cq_club_founding_access enable row level security;
revoke all on table public.cq_club_founding_payments from public, anon, authenticated;
revoke all on table public.cq_club_founding_access from public, anon, authenticated;

create or replace function public.apply_cq_club_founding_payment(
  p_user_id uuid,
  p_organization_id uuid,
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
  v_row public.cq_club_founding_payments%rowtype;
  v_starts timestamptz;
  v_ends timestamptz;
  v_representative boolean;
begin
  if p_amount is distinct from 9900 or lower(p_currency) is distinct from 'usd' then
    raise exception 'founding club payment amount is not the test price';
  end if;
  if p_checkout_session_id is null or char_length(p_checkout_session_id) < 8 then
    raise exception 'founding club payment is missing a checkout session';
  end if;
  if p_paid_at is null or p_organization_id is null or p_user_id is null then
    raise exception 'founding club payment is incomplete';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_organization_id::text));

  v_starts := p_paid_at;
  v_ends := p_paid_at + interval '90 days';

  select exists (
    select 1
    from public.organization_members m
    join public.student_organizations o on o.id = m.organization_id
    where o.external_organization_id = p_organization_id
      and m.user_id = p_user_id
      and m.status = 'approved'
      and m.org_role in ('owner', 'admin')
  ) into v_representative;

  if not v_representative then
    insert into public.cq_club_founding_payments (
      checkout_session_id, organization_id, user_id, payment_intent_id,
      amount, currency, status, applied
    ) values (
      p_checkout_session_id, p_organization_id, p_user_id, nullif(p_payment_intent_id, ''),
      p_amount, 'usd', 'failed', false
    )
    on conflict (checkout_session_id) do nothing;
    return jsonb_build_object('applied', false, 'duplicate', false, 'reason', 'not_representative');
  end if;

  insert into public.cq_club_founding_payments (
    checkout_session_id, organization_id, user_id, payment_intent_id,
    amount, currency, status, paid_at, access_starts_at, access_ends_at, applied
  ) values (
    p_checkout_session_id, p_organization_id, p_user_id, nullif(p_payment_intent_id, ''),
    p_amount, 'usd', 'paid', p_paid_at, v_starts, v_ends, false
  )
  on conflict (checkout_session_id) do nothing;

  select * into v_row
  from public.cq_club_founding_payments
  where checkout_session_id = p_checkout_session_id
  for update;

  if v_row.user_id is distinct from p_user_id
     or v_row.organization_id is distinct from p_organization_id
     or v_row.status is distinct from 'paid' then
    raise exception 'founding club payment owner does not match';
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
    from public.cq_club_founding_access access
    where access.organization_id = p_organization_id
      and access.starts_at <= p_paid_at
      and access.ends_at > p_paid_at
  ) then
    update public.cq_club_founding_payments
    set processed_at = now()
    where checkout_session_id = p_checkout_session_id;
    return jsonb_build_object('applied', false, 'duplicate', true, 'reason', 'already_active');
  end if;

  insert into public.cq_club_founding_access (
    organization_id, purchased_by_user_id, starts_at, ends_at,
    checkout_session_id, payment_intent_id, amount, currency, status, updated_at
  ) values (
    p_organization_id, p_user_id, v_row.access_starts_at, v_row.access_ends_at,
    p_checkout_session_id, v_row.payment_intent_id, 9900, 'usd', 'active', now()
  )
  on conflict (organization_id) do update
  set purchased_by_user_id = excluded.purchased_by_user_id,
      starts_at = excluded.starts_at,
      ends_at = excluded.ends_at,
      checkout_session_id = excluded.checkout_session_id,
      payment_intent_id = excluded.payment_intent_id,
      amount = excluded.amount,
      currency = excluded.currency,
      status = 'active',
      updated_at = now()
  where public.cq_club_founding_access.ends_at <= p_paid_at;

  update public.cq_club_founding_payments
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

revoke all on function public.apply_cq_club_founding_payment(uuid, uuid, text, text, integer, text, timestamptz) from public;
revoke all on function public.apply_cq_club_founding_payment(uuid, uuid, text, text, integer, text, timestamptz) from anon;
revoke all on function public.apply_cq_club_founding_payment(uuid, uuid, text, text, integer, text, timestamptz) from authenticated;
grant execute on function public.apply_cq_club_founding_payment(uuid, uuid, text, text, integer, text, timestamptz) to service_role;
