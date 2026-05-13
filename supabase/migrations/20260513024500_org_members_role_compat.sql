-- Compatibility patch for org membership schema drift:
-- older environments still have organization_members.role as NOT NULL.

alter table public.organization_members
  alter column role drop not null;

-- Preserve follower/member intent from legacy role values.
update public.organization_members
set membership_kind = 'follower'
where role = 'follower'
  and membership_kind = 'member';

-- Preserve elevated legacy manager role.
update public.organization_members
set org_role = 'admin'
where role = 'manager'
  and org_role = 'member';
