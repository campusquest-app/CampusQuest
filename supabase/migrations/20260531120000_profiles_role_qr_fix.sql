-- Idempotent fix: profiles.role required for QR scan permissions.
-- Safe to run even if 20260529120000_qr_codes_system.sql was not applied yet.

alter table public.profiles
  add column if not exists role text not null default 'student';

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('student', 'admin', 'super_admin'));

create index if not exists profiles_role_idx on public.profiles (role);

-- CampusQuest operator (profiles has no email column — join auth.users)
update public.profiles p
set role = 'super_admin'
from auth.users u
where p.id = u.id
  and lower(u.email) = lower('nicklockhart22@uri.edu');
