-- Internal tester campus-access bypass (see lib/server/campusAccess.ts).
-- Trusted internal accounts (QA / beta testers) must never be blocked by the
-- campus email verification gate. Access is role/flag based — no email domain
-- checks — so future testers can be added by flipping a column, not shipping code.

alter table public.profiles
  add column if not exists is_internal_tester boolean not null default false;

-- Allow a dedicated 'beta_internal' role alongside the existing 'qa' role.
alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('student', 'admin', 'super_admin', 'qa', 'beta_internal'));

-- The flag is almost always false; index only the rare true rows.
create index if not exists profiles_is_internal_tester_true_idx
  on public.profiles (id)
  where is_internal_tester = true;

-- Backfill: every qa / beta_internal account is an internal tester.
update public.profiles
set is_internal_tester = true
where role in ('qa', 'beta_internal')
  and is_internal_tester = false;
