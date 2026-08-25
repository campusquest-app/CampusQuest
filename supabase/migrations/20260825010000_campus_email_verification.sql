-- CampusQuest app-owned URI email verification (6-digit codes).
-- Supabase Auth remains the session/password authority.
-- profiles.campus_email_verified_at is the university-email ownership flag.

alter table public.profiles
  add column if not exists campus_email_verified_at timestamptz;

comment on column public.profiles.campus_email_verified_at is
  'When the user proved ownership of their campus email via CampusQuest 6-digit verification. Independent of auth.users.email_confirmed_at.';

create table if not exists public.campus_email_verification_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  email text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0 check (attempts >= 0),
  created_at timestamptz not null default now(),
  dispatched_at timestamptz,
  consumed_at timestamptz,
  invalidated_at timestamptz
);

create index if not exists idx_campus_email_verif_user_created
  on public.campus_email_verification_challenges (user_id, created_at desc);

create index if not exists idx_campus_email_verif_active
  on public.campus_email_verification_challenges (user_id, expires_at)
  where consumed_at is null and invalidated_at is null;

create index if not exists idx_campus_email_verif_cleanup
  on public.campus_email_verification_challenges (expires_at)
  where consumed_at is null and invalidated_at is null;

alter table public.campus_email_verification_challenges enable row level security;

-- No authenticated/anon policies: ordinary clients cannot read hashes or write challenges.
-- Service role bypasses RLS for server-side send/verify.

-- Prevent clients from marking themselves campus-verified.
-- Only lock JWT roles (authenticated/anon). Migrations, postgres, and
-- service_role must still be able to backfill and set the timestamp.
create or replace function public.protect_campus_email_verified_at()
returns trigger
language plpgsql
as $$
begin
  if auth.role() not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.campus_email_verified_at := null;
    return new;
  end if;
  new.campus_email_verified_at := old.campus_email_verified_at;
  return new;
end;
$$;

drop trigger if exists trg_protect_campus_email_verified_at on public.profiles;
create trigger trg_protect_campus_email_verified_at
before insert or update on public.profiles
for each row
execute function public.protect_campus_email_verified_at();

-- Grandfather existing users who already passed the previous Auth confirmation
-- model (including auto-confirm while requireEmailVerification was off).
-- New rows after this migration keep campus_email_verified_at null until 6-digit verify.
update public.profiles p
set campus_email_verified_at = coalesce(u.email_confirmed_at, now())
from auth.users u
where p.id = u.id
  and p.campus_email_verified_at is null
  and u.email_confirmed_at is not null;

-- Also grandfather users who already finished CampusQuest onboarding/character
-- setup even if Auth confirmation is missing — do not lock existing app users out.
update public.profiles p
set campus_email_verified_at = coalesce(p.onboarding_completed_at, p.created_at, now())
where p.campus_email_verified_at is null
  and (p.onboarding_completed = true or p.onboarding_character_completed = true);

-- Atomic attempt increment for the service-role verifier (not callable by clients).
create or replace function public.increment_campus_email_challenge_attempts(p_id uuid)
returns integer
language plpgsql
as $$
declare
  next_attempts integer;
begin
  update public.campus_email_verification_challenges
  set attempts = attempts + 1
  where id = p_id
    and consumed_at is null
    and invalidated_at is null
  returning attempts into next_attempts;
  return coalesce(next_attempts, 0);
end;
$$;

revoke all on function public.increment_campus_email_challenge_attempts(uuid) from public;
revoke all on function public.increment_campus_email_challenge_attempts(uuid) from anon;
revoke all on function public.increment_campus_email_challenge_attempts(uuid) from authenticated;
grant execute on function public.increment_campus_email_challenge_attempts(uuid) to service_role;

-- Consume a matching hash and stamp campus_email_verified_at in one transaction.
create or replace function public.consume_campus_email_challenge_and_verify(
  p_id uuid,
  p_user_id uuid,
  p_code_hash text,
  p_now timestamptz default now()
) returns boolean
language plpgsql
as $$
declare
  consumed_id uuid;
begin
  update public.campus_email_verification_challenges
  set consumed_at = p_now
  where id = p_id
    and user_id = p_user_id
    and code_hash = p_code_hash
    and consumed_at is null
    and invalidated_at is null
    and expires_at > p_now
  returning id into consumed_id;

  if consumed_id is null then
    return false;
  end if;

  update public.profiles
  set campus_email_verified_at = p_now
  where id = p_user_id
    and campus_email_verified_at is null;

  return true;
end;
$$;

revoke all on function public.consume_campus_email_challenge_and_verify(uuid, uuid, text, timestamptz) from public;
revoke all on function public.consume_campus_email_challenge_and_verify(uuid, uuid, text, timestamptz) from anon;
revoke all on function public.consume_campus_email_challenge_and_verify(uuid, uuid, text, timestamptz) from authenticated;
grant execute on function public.consume_campus_email_challenge_and_verify(uuid, uuid, text, timestamptz) to service_role;
