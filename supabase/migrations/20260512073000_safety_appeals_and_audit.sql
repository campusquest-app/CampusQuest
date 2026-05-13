-- Student safety appeals + moderation audit logs

create table if not exists public.user_safety_appeals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  message text not null check (char_length(message) between 10 and 2000),
  status text not null default 'pending' check (status in ('pending', 'reviewed', 'denied', 'approved')),
  moderator_note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_safety_appeals_user_created
  on public.user_safety_appeals(user_id, created_at desc);

create index if not exists idx_user_safety_appeals_status_created
  on public.user_safety_appeals(status, created_at desc);

create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid references public.profiles(id) on delete set null,
  admin_email text,
  action_type text not null,
  target_user_id uuid references public.profiles(id) on delete set null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_admin_audit_logs_created
  on public.admin_audit_logs(created_at desc);

create index if not exists idx_admin_audit_logs_action
  on public.admin_audit_logs(action_type, created_at desc);

drop trigger if exists trg_user_safety_appeals_updated_at on public.user_safety_appeals;
create trigger trg_user_safety_appeals_updated_at
before update on public.user_safety_appeals
for each row execute function public.set_updated_at();

alter table public.user_safety_appeals enable row level security;
alter table public.admin_audit_logs enable row level security;

drop policy if exists "user_safety_appeals own read" on public.user_safety_appeals;
create policy "user_safety_appeals own read"
on public.user_safety_appeals for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "user_safety_appeals own insert" on public.user_safety_appeals;
create policy "user_safety_appeals own insert"
on public.user_safety_appeals for insert
to authenticated
with check (auth.uid() = user_id);
