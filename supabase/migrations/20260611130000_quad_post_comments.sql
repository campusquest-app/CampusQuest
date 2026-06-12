-- Comments on Quad posts (separate from legacy public.posts comments)

alter table public.quad_posts
  add column if not exists comments_count integer not null default 0 check (comments_count >= 0);

create table if not exists public.quad_post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.quad_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) >= 1 and char_length(body) <= 200),
  created_at timestamptz not null default now()
);

create index if not exists quad_post_comments_post_created_idx
  on public.quad_post_comments (post_id, created_at asc);

create or replace function public.sync_quad_post_comments_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.quad_posts
    set comments_count = comments_count + 1
    where id = new.post_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.quad_posts
    set comments_count = greatest(0, comments_count - 1)
    where id = old.post_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_sync_quad_post_comments_count on public.quad_post_comments;
create trigger trg_sync_quad_post_comments_count
after insert or delete on public.quad_post_comments
for each row execute function public.sync_quad_post_comments_count();

alter table public.quad_post_comments enable row level security;

create policy "Authenticated users read quad post comments"
  on public.quad_post_comments for select
  using (auth.uid() is not null);

create policy "Users insert own quad post comments"
  on public.quad_post_comments for insert
  with check (auth.uid() = user_id);

create policy "Users delete own quad post comments"
  on public.quad_post_comments for delete
  using (auth.uid() = user_id);
