-- PROPOSED — NOT APPLIED. Move into supabase/migrations/ with a timestamp once approved.
--
-- Adds first-class columns for organization / Greek Life verification details that
-- are currently stored as a labeled "Request details" block in reason_for_access
-- (see composeOrganizationRequestNotes in lib/identity/organizationVerification.ts),
-- plus a database-level guard against two students opening requests for the same
-- organization name. Additive and idempotent; no existing rows are rewritten.

alter table public.verification_requests
  add column if not exists school_name text
    check (school_name is null or char_length(trim(school_name)) between 2 and 120),
  add column if not exists greek_type text
    check (greek_type is null or greek_type in ('fraternity', 'sorority')),
  add column if not exists national_affiliation text
    check (national_affiliation is null or char_length(trim(national_affiliation)) <= 120),
  add column if not exists advisor_name text
    check (advisor_name is null or char_length(trim(advisor_name)) <= 120),
  add column if not exists advisor_email text
    check (advisor_email is null or char_length(trim(advisor_email)) <= 180);

-- Cross-applicant duplicate guard. The existing uniq_verification_pending_name index
-- is scoped per applicant. Check for existing open duplicates before creating this:
--   select lower(trim(name)), count(*) from public.verification_requests
--   where identity_type = 'organization' and status in ('pending_review', 'needs_info')
--   group by 1 having count(*) > 1;
create unique index if not exists uniq_verification_open_org_name
  on public.verification_requests (lower(trim(name)))
  where identity_type = 'organization' and status in ('pending_review', 'needs_info');
