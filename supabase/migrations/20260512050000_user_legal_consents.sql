-- Track legal consent acknowledgements per policy version

create table if not exists public.user_legal_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  policy_version text not null,
  accepted_terms boolean not null default false,
  accepted_privacy boolean not null default false,
  accepted_guidelines boolean not null default false,
  ip_address inet,
  user_agent text,
  consented_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_legal_consents_acceptance_check check (
    accepted_terms = true and accepted_privacy = true and accepted_guidelines = true
  ),
  unique (user_id, policy_version)
);

create index if not exists idx_user_legal_consents_user_consented_at
  on public.user_legal_consents(user_id, consented_at desc);

drop trigger if exists trg_user_legal_consents_updated_at on public.user_legal_consents;
create trigger trg_user_legal_consents_updated_at
before update on public.user_legal_consents
for each row execute function public.set_updated_at();

alter table public.user_legal_consents enable row level security;

drop policy if exists "user_legal_consents manage own" on public.user_legal_consents;
create policy "user_legal_consents manage own"
on public.user_legal_consents for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
