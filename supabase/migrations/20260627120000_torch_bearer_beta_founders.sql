-- Torch Bearer Badge: first 30 non-admin beta founders (numbered, retired after #30).

create table if not exists public.beta_founders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete restrict,
  founder_number int not null check (founder_number between 1 and 30),
  awarded_at timestamptz not null default now(),
  constraint beta_founders_user_id_unique unique (user_id),
  constraint beta_founders_founder_number_unique unique (founder_number)
);

create index if not exists idx_beta_founders_founder_number on public.beta_founders (founder_number);
create index if not exists idx_beta_founders_awarded_at on public.beta_founders (awarded_at);

alter table public.beta_founders enable row level security;

-- Founders can read their own row; admins read all (via service role in API).
create policy "beta_founders_select_own"
on public.beta_founders for select
to authenticated
using (auth.uid() = user_id);

create or replace function public.award_torch_bearer_badge(
  p_user_id uuid,
  p_allow_admin boolean default false
)
returns table (founder_number int, newly_awarded boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing int;
  v_count int;
  v_next int;
  v_role text;
  v_gs jsonb;
  v_achievements jsonb;
  v_featured jsonb;
begin
  perform pg_advisory_xact_lock(8742031);

  select bf.founder_number into v_existing
  from public.beta_founders bf
  where bf.user_id = p_user_id;

  if found then
    return query select v_existing, false;
    return;
  end if;

  if not p_allow_admin then
    select coalesce(p.role, 'student') into v_role
    from public.profiles p
    where p.id = p_user_id;

    if v_role in ('admin', 'super_admin') then
      return;
    end if;
  end if;

  select count(*)::int into v_count from public.beta_founders;
  if v_count >= 30 then
    return;
  end if;

  v_next := v_count + 1;

  insert into public.beta_founders (user_id, founder_number)
  values (p_user_id, v_next);

  select coalesce(p.game_state_json, '{}'::jsonb) into v_gs
  from public.profiles p
  where p.id = p_user_id;

  v_gs := v_gs || jsonb_build_object(
    'torchBearerBadge', true,
    'torchBearerFounderNumber', v_next
  );

  v_achievements := coalesce(v_gs->'achievements', '[]'::jsonb);
  if not v_achievements @> '["torch_bearer_badge"]'::jsonb then
    v_achievements := v_achievements || '["torch_bearer_badge"]'::jsonb;
  end if;
  v_gs := jsonb_set(v_gs, '{achievements}', v_achievements, true);

  v_featured := coalesce(v_gs->'featuredAchievementIds', '[]'::jsonb);
  if jsonb_array_length(v_featured) < 3 and not v_featured @> '["torch_bearer_badge"]'::jsonb then
    v_featured := v_featured || '["torch_bearer_badge"]'::jsonb;
    v_gs := jsonb_set(v_gs, '{featuredAchievementIds}', v_featured, true);
  end if;

  update public.profiles
  set game_state_json = v_gs
  where id = p_user_id;

  return query select v_next, true;
end;
$$;

revoke all on function public.award_torch_bearer_badge(uuid, boolean) from public;
grant execute on function public.award_torch_bearer_badge(uuid, boolean) to service_role;
