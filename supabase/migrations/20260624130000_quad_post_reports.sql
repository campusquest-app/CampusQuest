-- Quad feed post reports (user-submitted moderation)

create table if not exists public.quad_post_reports (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  post_owner_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (
    reason in ('harassment', 'hate_speech', 'nudity', 'violence', 'spam', 'misinformation', 'other')
  ),
  details text,
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  moderator_note text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (post_id, reporter_id)
);

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'quad_posts'
  ) and not exists (
    select 1 from pg_constraint where conname = 'quad_post_reports_post_id_fkey'
  ) then
    alter table public.quad_post_reports
      add constraint quad_post_reports_post_id_fkey
      foreign key (post_id) references public.quad_posts(id) on delete cascade;
  end if;
end $$;

create index if not exists idx_quad_post_reports_status_created
  on public.quad_post_reports(status, created_at desc);

create index if not exists idx_quad_post_reports_post
  on public.quad_post_reports(post_id, created_at desc);

drop trigger if exists trg_quad_post_reports_updated_at on public.quad_post_reports;
create trigger trg_quad_post_reports_updated_at
before update on public.quad_post_reports
for each row execute function public.set_updated_at();

alter table public.quad_post_reports enable row level security;

drop policy if exists "quad_post_reports insert own" on public.quad_post_reports;
create policy "quad_post_reports insert own"
on public.quad_post_reports for insert
to authenticated
with check (auth.uid() = reporter_id);

drop policy if exists "quad_post_reports read own" on public.quad_post_reports;
create policy "quad_post_reports read own"
on public.quad_post_reports for select
to authenticated
using (auth.uid() = reporter_id);

comment on table public.quad_post_reports is 'User reports for Quad feed posts';
