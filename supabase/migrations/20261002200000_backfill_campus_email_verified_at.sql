-- Make profiles.campus_email_verified_at the single campus-verification source
-- for users who were verified under the pre-6-digit model.
--
-- 20260825010000_campus_email_verification intended to grandfather existing
-- users, but its UPDATEs ran after trg_protect_campus_email_verified_at was
-- created. Outside a PostgREST request auth.role() is NULL, and
-- `NULL not in ('authenticated', 'anon')` is not true, so the trigger reset
-- every row to its old NULL value and the grandfathering silently did nothing.
--
-- Selection (legacy verified, pre-rollout):
--   * profile has no campus_email_verified_at (never overwritten)
--   * user_school_verifications row for the same user is 'verified' with a
--     verified_at timestamp and school_domain = 'uri.edu' (current pilot rule)
--   * auth.users email is @uri.edu, confirmed, and not deleted
--   * account created before the 6-digit rollout (commit 5834d7e,
--     2026-08-25 04:39:43 UTC). Later signups were required to use the code,
--     so a verified row without a timestamp for them is not proof.
-- Timestamp: user_school_verifications.verified_at (the recorded verification).
--
-- Afterwards, any remaining 'verified' row whose profile still has no
-- timestamp is downgraded to 'pending' — exactly what
-- ensureSchoolVerificationForUser derives on that user's next request — so
-- campus leaderboards and scoping never treat them as verified in between.

create or replace function public.protect_campus_email_verified_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if public.cq_is_trusted_writer() then
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

update public.profiles p
set campus_email_verified_at = v.verified_at
from public.user_school_verifications v, auth.users u
where v.user_id = p.id
  and u.id = p.id
  and p.campus_email_verified_at is null
  and v.status = 'verified'
  and v.verified_at is not null
  and lower(v.school_domain) = 'uri.edu'
  and lower(split_part(u.email, '@', 2)) = 'uri.edu'
  and u.email_confirmed_at is not null
  and u.deleted_at is null
  and u.created_at < timestamptz '2026-08-25 04:39:43+00';

update public.user_school_verifications v
set status = 'pending',
    school_name = null,
    verified_at = null,
    updated_at = now()
from public.profiles p
where p.id = v.user_id
  and v.status = 'verified'
  and p.campus_email_verified_at is null;
