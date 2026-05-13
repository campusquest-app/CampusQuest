-- Event hosting model: distinguish user-hosted vs organization-hosted rows.

alter table public.campus_events
  add column if not exists host_user_id uuid references public.profiles(id) on delete set null;

alter table public.campus_events
  add column if not exists host_type text;

update public.campus_events
set host_type = case when host_organization_id is not null then 'organization' else 'user' end
where host_type is null;

alter table public.campus_events
  alter column host_type set default 'user';

alter table public.campus_events
  alter column host_type set not null;

alter table public.campus_events drop constraint if exists campus_events_host_type_check;
alter table public.campus_events
  add constraint campus_events_host_type_check check (host_type in ('user', 'organization'));

alter table public.campus_events drop constraint if exists campus_events_host_consistency_check;
alter table public.campus_events
  add constraint campus_events_host_consistency_check check (
    (host_type = 'user' and host_organization_id is null)
    or
    (host_type = 'organization' and host_organization_id is not null)
  );

-- Backfill: personal events show host from profile keyed off created_by until host_user_id is set explicitly.
update public.campus_events
set host_user_id = created_by
where host_type = 'user'
  and host_user_id is null;
