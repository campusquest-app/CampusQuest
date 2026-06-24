-- Allow admin test-user deletion to cascade through the last RESTRICT blockers.
-- Application code still deletes owned guilds and beta founder rows explicitly for logging.

alter table public.guilds
  drop constraint if exists guilds_owner_id_fkey;

alter table public.guilds
  add constraint guilds_owner_id_fkey
  foreign key (owner_id) references public.profiles(id) on delete cascade;

alter table public.beta_founders
  drop constraint if exists beta_founders_user_id_fkey;

alter table public.beta_founders
  add constraint beta_founders_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;
