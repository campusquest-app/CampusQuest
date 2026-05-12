-- Proof submission MVP hardening

create table if not exists public.proof_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  quest_id uuid references public.quests(id) on delete set null,
  user_quest_id uuid references public.user_quests(id) on delete set null,
  quest_completion_id uuid references public.quest_completions(id) on delete set null,
  storage_path text not null,
  public_url text,
  mime_type text,
  file_size_bytes integer,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  review_note text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.proof_submissions
  add column if not exists quest_id uuid references public.quests(id) on delete set null,
  add column if not exists user_quest_id uuid references public.user_quests(id) on delete set null,
  add column if not exists quest_completion_id uuid references public.quest_completions(id) on delete set null,
  add column if not exists mime_type text,
  add column if not exists file_size_bytes integer,
  add column if not exists review_note text,
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists idx_proof_pending_unique_user_quest
  on public.proof_submissions(user_id, user_quest_id)
  where status = 'pending' and user_quest_id is not null;

create index if not exists idx_proof_submissions_user_status_created
  on public.proof_submissions(user_id, status, created_at desc);

drop trigger if exists trg_proof_submissions_updated_at on public.proof_submissions;
create trigger trg_proof_submissions_updated_at
before update on public.proof_submissions
for each row execute function public.set_updated_at();

