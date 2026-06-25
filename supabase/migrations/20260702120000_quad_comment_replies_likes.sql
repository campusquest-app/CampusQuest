-- Nested replies + likes on Quad post comments

alter table public.quad_post_comments
  add column if not exists parent_comment_id uuid references public.quad_post_comments(id) on delete cascade,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists quad_post_comments_parent_idx
  on public.quad_post_comments (parent_comment_id)
  where parent_comment_id is not null;

drop policy if exists "Users update own quad post comments" on public.quad_post_comments;
create policy "Users update own quad post comments"
  on public.quad_post_comments for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.quad_comment_likes (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.quad_post_comments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (comment_id, user_id)
);

create index if not exists quad_comment_likes_comment_idx
  on public.quad_comment_likes (comment_id);

create index if not exists quad_comment_likes_user_idx
  on public.quad_comment_likes (user_id);

alter table public.quad_comment_likes enable row level security;

drop policy if exists "Authenticated users read quad comment likes" on public.quad_comment_likes;
create policy "Authenticated users read quad comment likes"
  on public.quad_comment_likes for select
  using (auth.uid() is not null);

drop policy if exists "Users insert own quad comment likes" on public.quad_comment_likes;
create policy "Users insert own quad comment likes"
  on public.quad_comment_likes for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users delete own quad comment likes" on public.quad_comment_likes;
create policy "Users delete own quad comment likes"
  on public.quad_comment_likes for delete
  using (auth.uid() = user_id);
