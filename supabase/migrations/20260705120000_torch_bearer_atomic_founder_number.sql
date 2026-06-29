-- Fix: founder_number was derived from count(*) + 1, which collides with the
-- unique constraint whenever a gap exists (e.g. after a beta_founders row is
-- removed by the on-delete-cascade added in 20260701120000). Two near-simultaneous
-- signups were already serialized by the advisory lock, but the count-based math
-- still re-issued an existing number after any deletion, raising:
--   duplicate key value violates unique constraint "beta_founders_founder_number_unique"
--
-- Replace count(*) + 1 with an atomic "smallest unused slot in 1..30" lookup,
-- still guarded by the existing transaction advisory lock so concurrent signups
-- can never compute the same number. Numbers fill gaps, stay within 1..30, and
-- are assigned exactly once per user (existing-user short-circuit preserved).

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
  v_next int;
  v_role text;
  v_gs jsonb;
  v_achievements jsonb;
  v_featured jsonb;
begin
  -- Serialize all award attempts so the slot lookup + insert is atomic.
  perform pg_advisory_xact_lock(8742031);

  -- Already a founder? Return their existing number, never re-insert.
  select bf.founder_number into v_existing
  from public.beta_founders bf
  where bf.user_id = p_user_id;

  if found then
    return query select v_existing, false;
    return;
  end if;

  -- Admins/super_admins do not consume founder slots unless explicitly allowed.
  if not p_allow_admin then
    select coalesce(p.role, 'student') into v_role
    from public.profiles p
    where p.id = p_user_id;

    if v_role in ('admin', 'super_admin') then
      return;
    end if;
  end if;

  -- Atomically pick the smallest free founder number in 1..30. This fills gaps
  -- left by deletions and can never collide with an existing row. Holding the
  -- advisory lock guarantees concurrent callers observe each other's inserts.
  select min(g)::int into v_next
  from generate_series(1, 30) as g
  left join public.beta_founders bf on bf.founder_number = g
  where bf.founder_number is null;

  -- All 30 slots claimed → badge retired, award nothing.
  if v_next is null then
    return;
  end if;

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
