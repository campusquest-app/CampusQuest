-- Runtime-configurable legal policy versions for re-consent

create table if not exists public.legal_policy_versions (
  version text primary key,
  is_active boolean not null default false,
  activated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_legal_policy_versions_single_active
  on public.legal_policy_versions((is_active))
  where is_active = true;

drop trigger if exists trg_legal_policy_versions_updated_at on public.legal_policy_versions;
create trigger trg_legal_policy_versions_updated_at
before update on public.legal_policy_versions
for each row execute function public.set_updated_at();

alter table public.legal_policy_versions enable row level security;

drop policy if exists "legal_policy_versions read authenticated" on public.legal_policy_versions;
create policy "legal_policy_versions read authenticated"
on public.legal_policy_versions for select
to authenticated
using (true);

insert into public.legal_policy_versions(version, is_active, activated_at)
values ('2026-05-12.1', true, now())
on conflict (version) do update set
  is_active = true,
  activated_at = excluded.activated_at,
  updated_at = now();
