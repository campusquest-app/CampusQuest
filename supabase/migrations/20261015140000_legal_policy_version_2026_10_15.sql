-- Publish October 15, 2026 privacy-aligned legal policy version (idempotent).
-- Historical consent rows for prior versions are left intact.

update public.legal_policy_versions
set is_active = false
where is_active = true
  and version <> '2026-10-15.1';

insert into public.legal_policy_versions (version, is_active, activated_at)
values ('2026-10-15.1', true, now())
on conflict (version) do update
set is_active = true,
    activated_at = excluded.activated_at;

update public.legal_policy_versions
set is_active = false
where version <> '2026-10-15.1'
  and is_active = true;
