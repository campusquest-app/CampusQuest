-- QA test account support (see lib/server/qaTestAccount.ts).
-- Adds hidden/test flags to profiles plus a 'qa' role so the permanent
-- onboarding QA account can be excluded from all public surfaces.

alter table public.profiles
  add column if not exists is_test_user boolean not null default false,
  add column if not exists is_hidden boolean not null default false;

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('student', 'admin', 'super_admin', 'qa'));

-- Partial indexes: the flags are almost always false, so index only the rare true rows.
create index if not exists profiles_is_hidden_true_idx
  on public.profiles (id)
  where is_hidden = true;

create index if not exists profiles_is_test_user_true_idx
  on public.profiles (id)
  where is_test_user = true;

-- If the QA auth user already exists, flag its profile (idempotent).
update public.profiles p
set is_test_user = true,
    is_hidden = true,
    role = 'qa'
from auth.users u
where p.id = u.id
  and lower(u.email) = 'qa-signup@campusquest.app';
