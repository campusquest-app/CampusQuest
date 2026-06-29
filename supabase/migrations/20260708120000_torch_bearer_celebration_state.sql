-- Torch Bearer unlock-celebration state.
--
-- Problem: the award RPC wrote `torchBearerFounderNumber` + added the badge to
-- `achievements`, but never recorded WHEN the badge was earned, and never recorded
-- whether its one-time unlock celebration had been shown. The client re-derived the
-- badge as "newly unlocked" on every hydrate (earned-at absent) and replayed the
-- mythic modal on every app open.
--
-- Fix: persist two timestamps in profiles.game_state_json so the celebration is
-- shown exactly once per user and the badge stays visible in Codex/Trophy Room:
--   achievementEarnedAt.torch_bearer_badge      -- when the badge was granted
--   achievementCelebratedAt.torch_bearer_badge  -- when the unlock modal was seen
--
-- Semantics:
--   * NEW award      → set earnedAt only; leave celebratedAt unset so the client
--                      plays the modal once, then marks it seen (persisted by the app).
--   * EXISTING holder → backfill BOTH earnedAt and celebratedAt if missing, so users
--                      who already saw (or were spammed by) the modal never see it again.
--
-- Idempotent: backfill only writes when something actually changed; the award path
-- still short-circuits existing founders (no duplicate beta_founders rows / numbers).

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
  v_gs_orig jsonb;
  v_achievements jsonb;
  v_featured jsonb;
  v_now jsonb := to_jsonb(now());
begin
  -- Serialize all award attempts so the slot lookup + insert is atomic.
  perform pg_advisory_xact_lock(8742031);

  -- Already a founder? Backfill earned/celebrated state, then return existing number.
  select bf.founder_number into v_existing
  from public.beta_founders bf
  where bf.user_id = p_user_id;

  if found then
    select coalesce(p.game_state_json, '{}'::jsonb) into v_gs
    from public.profiles p
    where p.id = p_user_id;
    v_gs_orig := v_gs;

    -- Ensure the cached founder number / flag are present (defensive; usually set).
    if (v_gs->'torchBearerFounderNumber') is null then
      v_gs := v_gs || jsonb_build_object('torchBearerBadge', true, 'torchBearerFounderNumber', v_existing);
    end if;

    v_gs := jsonb_set(v_gs, '{achievementEarnedAt}', coalesce(v_gs->'achievementEarnedAt', '{}'::jsonb), true);
    if (v_gs->'achievementEarnedAt'->'torch_bearer_badge') is null then
      v_gs := jsonb_set(v_gs, '{achievementEarnedAt,torch_bearer_badge}', v_now, true);
    end if;

    v_gs := jsonb_set(v_gs, '{achievementCelebratedAt}', coalesce(v_gs->'achievementCelebratedAt', '{}'::jsonb), true);
    if (v_gs->'achievementCelebratedAt'->'torch_bearer_badge') is null then
      v_gs := jsonb_set(v_gs, '{achievementCelebratedAt,torch_bearer_badge}', v_now, true);
    end if;

    if v_gs is distinct from v_gs_orig then
      update public.profiles set game_state_json = v_gs where id = p_user_id;
    end if;

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

  -- Atomically pick the smallest free founder number in 1..30.
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

  -- Record the earn time so the badge is never re-detected as "newly unlocked".
  -- Intentionally do NOT set achievementCelebratedAt here: a brand-new award should
  -- play its mythic unlock modal exactly once, after which the app marks it seen.
  v_gs := jsonb_set(v_gs, '{achievementEarnedAt}', coalesce(v_gs->'achievementEarnedAt', '{}'::jsonb), true);
  v_gs := jsonb_set(v_gs, '{achievementEarnedAt,torch_bearer_badge}', v_now, true);

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
