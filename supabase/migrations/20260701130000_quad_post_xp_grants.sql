-- One-time XP grant per Quad post + daily cap enforcement in application code.

create table if not exists public.quad_post_xp_grants (
  post_id uuid not null references public.quad_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  xp_amount integer not null default 10 check (xp_amount > 0 and xp_amount <= 100),
  granted_at timestamptz not null default now(),
  primary key (post_id)
);

create index if not exists quad_post_xp_grants_user_day_idx
  on public.quad_post_xp_grants (user_id, granted_at desc);

alter table public.quad_post_xp_grants enable row level security;

create policy "Users read own quad post xp grants"
  on public.quad_post_xp_grants for select
  using (auth.uid() = user_id);

-- Extend xp_logs source_type for Quad post creation rewards
alter table public.xp_logs drop constraint if exists xp_logs_source_type_check;
alter table public.xp_logs add constraint xp_logs_source_type_check
  check (source_type in (
    'activity',
    'quest',
    'boss',
    'guild',
    'manual',
    'streak_bonus',
    'bonus',
    'quad_spark',
    'quad_post'
  ));
