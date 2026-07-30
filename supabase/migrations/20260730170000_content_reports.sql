-- Unified user-generated content reports (users, comments, infringement, etc.)
-- Idempotent: safe to re-run.

create table if not exists public.content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null check (
    target_type in (
      'user',
      'comment',
      'post',
      'message',
      'event',
      'organization',
      'infringement',
      'other'
    )
  ),
  target_id uuid,
  reported_user_id uuid references public.profiles(id) on delete set null,
  reason text not null check (
    reason in (
      'harassment',
      'hate_speech',
      'nudity',
      'violence',
      'spam',
      'misinformation',
      'copyright_infringement',
      'restricted_content',
      'impersonation',
      'other'
    )
  ),
  details text,
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  moderator_note text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_content_reports_unique_target
  on public.content_reports (reporter_id, target_type, target_id)
  where target_id is not null;

create index if not exists idx_content_reports_status_created
  on public.content_reports (status, created_at desc);

create index if not exists idx_content_reports_reported_user
  on public.content_reports (reported_user_id, created_at desc)
  where reported_user_id is not null;

drop trigger if exists trg_content_reports_updated_at on public.content_reports;
create trigger trg_content_reports_updated_at
before update on public.content_reports
for each row execute function public.set_updated_at();

alter table public.content_reports enable row level security;

drop policy if exists "content_reports insert own" on public.content_reports;
create policy "content_reports insert own"
on public.content_reports for insert
to authenticated
with check (auth.uid() = reporter_id);

drop policy if exists "content_reports read own" on public.content_reports;
create policy "content_reports read own"
on public.content_reports for select
to authenticated
using (auth.uid() = reporter_id);

comment on table public.content_reports is
  'User reports for profiles, comments, infringement, and other UGC targets used for store moderation.';
