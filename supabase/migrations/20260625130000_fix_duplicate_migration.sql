-- Allow platform admins (profiles.role) to delete any quad post via user-scoped client.
-- Moderation email allow-list admins delete via service role in API routes.
-- Safe when quad_posts was never created on this database.

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'quad_posts'
  ) then
    drop policy if exists "Admins delete quad posts" on public.quad_posts;
    create policy "Admins delete quad posts"
      on public.quad_posts for delete
      using (
        exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.role in ('admin', 'super_admin')
        )
      );
  end if;
end $$;
