-- Account-level safety state for suspension/ban controls

create table if not exists public.user_account_safety (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'suspended', 'banned')),
  reason text,
  suspended_until timestamptz,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_account_safety_status
  on public.user_account_safety(status, updated_at desc);

drop trigger if exists trg_user_account_safety_updated_at on public.user_account_safety;
create trigger trg_user_account_safety_updated_at
before update on public.user_account_safety
for each row execute function public.set_updated_at();

alter table public.user_account_safety enable row level security;

drop policy if exists "user_account_safety read own" on public.user_account_safety;
create policy "user_account_safety read own"
on public.user_account_safety for select
to authenticated
using (auth.uid() = user_id);
