-- Publish updated privacy-aligned legal policy version (idempotent).
-- Deactivate prior active rows first (unique partial index on is_active=true).

update public.legal_policy_versions
set is_active = false
where is_active = true
  and version <> '2026-08-11.1';

insert into public.legal_policy_versions (version, is_active, activated_at)
values ('2026-08-11.1', true, now())
on conflict (version) do update
set is_active = true,
    activated_at = excluded.activated_at;

update public.legal_policy_versions
set is_active = false
where version <> '2026-08-11.1'
  and is_active = true;
