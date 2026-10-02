-- Exact Auth email lookup for CampusQuest Basic signup.
--
-- One email returns one auth.users.id, or null when nobody has that address.
-- A database error must fail closed in the application. This function does not
-- scan the Auth user list.
--
-- search_path is only auth. lower() and trim() still resolve from pg_catalog,
-- which PostgreSQL searches before the configured path. auth.users is named
-- explicitly.
--
-- This migration does not change profiles, roles, verification timestamps,
-- challenges, activities, or billing.

create or replace function public.cq_auth_user_id_by_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = auth
as $$
  select id
  from auth.users
  where lower(email) = lower(trim(p_email))
  limit 1;
$$;

revoke all on function public.cq_auth_user_id_by_email(text) from public;
revoke all on function public.cq_auth_user_id_by_email(text) from anon;
revoke all on function public.cq_auth_user_id_by_email(text) from authenticated;
grant execute on function public.cq_auth_user_id_by_email(text) to service_role;

comment on function public.cq_auth_user_id_by_email(text) is
  'Service-role lookup of auth.users.id by normalized email. Returns null when nobody has that address. Errors must fail closed.';
