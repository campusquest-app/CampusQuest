-- Role-selection system (see lib/roles.ts + app/api/me/account-type).
--
-- Every user gets one account type: student, faculty_staff, admin (or
-- super_admin), qa, or beta_internal. New users pick Student / Faculty-Staff
-- during onboarding; existing users get a one-time prompt, so their blanket
-- default 'student' role becomes NULL ("not chosen yet") — never guessed
-- from their email address.
--
-- Idempotent and safe to re-run.

-- 1. role becomes nullable with no default: NULL means "user has not chosen".
alter table public.profiles alter column role drop not null;
alter table public.profiles alter column role drop default;

-- 2. Allowed values (super_admin/beta_internal kept from prior migrations).
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (
    role is null
    or role in ('student', 'faculty_staff', 'admin', 'super_admin', 'qa', 'beta_internal')
  );

-- 3. QA accounts test the role-selection step without ever changing their
--    protected 'qa' role; the test choice is stored separately.
alter table public.profiles
  add column if not exists qa_selected_role text
  check (qa_selected_role is null or qa_selected_role in ('student', 'faculty_staff'));

-- 4. Existing non-admin/non-tester users choose their own role: the historical
--    blanket default 'student' was never an explicit choice, so clear it.
--    (Server code treats NULL as baseline student permissions, so nothing
--    breaks while users pick.)
update public.profiles
set role = null
where role = 'student';

-- 5. Preserve / assign known admins (mirrors prior role migrations; the
--    runtime also self-heals NULL-role admins via the authorization system).
update public.profiles p
set role = 'super_admin'
from auth.users u
where p.id = u.id
  and lower(u.email) = lower('nicklockhart22@uri.edu')
  and (p.role is null or p.role <> 'super_admin');

update public.profiles p
set role = 'admin'
from auth.users u
where p.id = u.id
  and lower(u.email) in ('campusquest@campusquestapp.com', 'nicholaslockhart22@gmail.com')
  and p.role is null;

-- 6. The permanent QA account keeps role = qa (both historical and
--    recommended emails are covered) and stays a hidden internal tester.
update public.profiles p
set role = 'qa',
    is_test_user = true,
    is_hidden = true,
    is_internal_tester = true
from auth.users u
where p.id = u.id
  and lower(u.email) in ('qa-signup@campusquest.app', 'qa@campusquest.app');

-- 7. Role is filtered often (permissions, analytics, hidden-user exclusion).
create index if not exists profiles_role_idx on public.profiles (role);
