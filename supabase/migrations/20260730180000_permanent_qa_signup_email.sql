-- Permanent QA signup account: qa_signup@campusquestapp.com
-- Exact email only — does NOT grant bypass to all @campusquestapp.com addresses.
-- Idempotent.

-- Flag the permanent QA auth user if it already exists.
update public.profiles p
set is_test_user = true,
    is_hidden = true,
    is_internal_tester = true,
    role = 'qa'
from auth.users u
where p.id = u.id
  and lower(u.email) = 'qa_signup@campusquestapp.com';

-- Keep legacy QA emails flagged for existing environments.
update public.profiles p
set is_test_user = true,
    is_hidden = true,
    is_internal_tester = true,
    role = 'qa'
from auth.users u
where p.id = u.id
  and lower(u.email) in ('qa-signup@campusquest.app', 'qa@campusquest.app');
