-- Renumber the three legitimate Torch Bearer founders after concurrency-test cleanup.
-- Before: founder numbers 2, 3, 4 (gap at #1 from deleted test user #1).
-- After:  founder numbers 1, 2, 3 contiguous; next award receives #4.
--
-- Storage touched:
--   public.beta_founders.founder_number  (source of truth, unique 1..30)
--   profiles.game_state_json             (torchBearerFounderNumber cache)
--
-- Strategy: three sequential UPDATEs, each targeting a slot that is already free
-- (2→1, then 3→2, then 4→3). This never violates the unique constraint and
-- preserves row ids, user_ids, and awarded_at timestamps.

do $$
declare
  v_total int;
  v_dupes int;
  v_n1 int;
  v_n2 int;
  v_n3 int;
  v_n4 int;
  v_next int;
  v_row record;
begin
  -- ── Pre-flight: abort on duplicates ──────────────────────────────────────
  select count(*)::int into v_dupes
  from (
    select founder_number
    from public.beta_founders
    group by founder_number
    having count(*) > 1
  ) d;

  if v_dupes > 0 then
    raise exception 'CQ_TORCH_BEARER_RENUMBER_ABORT: duplicate founder_number detected before migration';
  end if;

  select count(*)::int into v_total from public.beta_founders;
  select count(*)::int into v_n1 from public.beta_founders where founder_number = 1;
  select count(*)::int into v_n2 from public.beta_founders where founder_number = 2;
  select count(*)::int into v_n3 from public.beta_founders where founder_number = 3;
  select count(*)::int into v_n4 from public.beta_founders where founder_number = 4;

  -- Idempotent: already renumbered → verify integrity and exit.
  if v_total = 3 and v_n1 = 1 and v_n2 = 1 and v_n3 = 1 and v_n4 = 0 then
    select min(g)::int into v_next
    from generate_series(1, 30) as g
    left join public.beta_founders bf on bf.founder_number = g
    where bf.founder_number is null;

    if v_next is distinct from 4 then
      raise exception 'CQ_TORCH_BEARER_RENUMBER_ABORT: already contiguous 1-3 but next slot is % (expected 4)', v_next;
    end if;

    raise notice 'CQ_TORCH_BEARER_RENUMBER_SKIP: founders already numbered 1, 2, 3; next slot=%', v_next;
    return;
  end if;

  -- Require exactly the expected pre-migration state.
  if v_total <> 3 or v_n1 <> 0 or v_n2 <> 1 or v_n3 <> 1 or v_n4 <> 1 then
    raise exception
      'CQ_TORCH_BEARER_RENUMBER_ABORT: expected exactly 3 founders numbered 2,3,4 with no #1 (found total=%, n1=%, n2=%, n3=%, n4=%)',
      v_total, v_n1, v_n2, v_n3, v_n4;
  end if;

  -- Log mapping before mutation (visible in migration output).
  for v_row in
    select bf.user_id, bf.founder_number as old_number,
      case bf.founder_number when 2 then 1 when 3 then 2 when 4 then 3 end as new_number,
      bf.awarded_at
    from public.beta_founders bf
    where bf.founder_number in (2, 3, 4)
    order by bf.founder_number
  loop
    raise notice 'CQ_TORCH_BEARER_RENUMBER_MAP: user=% old=#% new=#% awarded_at=%',
      v_row.user_id, v_row.old_number, v_row.new_number, v_row.awarded_at;
  end loop;

  -- ── Renumber beta_founders (sequential; each step uses a free slot) ───────
  update public.beta_founders set founder_number = 1 where founder_number = 2;
  if not found then
    raise exception 'CQ_TORCH_BEARER_RENUMBER_ABORT: expected founder #2 row missing';
  end if;

  update public.beta_founders set founder_number = 2 where founder_number = 3;
  if not found then
    raise exception 'CQ_TORCH_BEARER_RENUMBER_ABORT: expected founder #3 row missing';
  end if;

  update public.beta_founders set founder_number = 3 where founder_number = 4;
  if not found then
    raise exception 'CQ_TORCH_BEARER_RENUMBER_ABORT: expected founder #4 row missing';
  end if;

  -- ── Sync cached founder number in profiles.game_state_json ─────────────
  -- Preserves all other game_state keys (achievements, XP, featured badges, etc.).
  update public.profiles p
  set game_state_json = coalesce(p.game_state_json, '{}'::jsonb)
    || jsonb_build_object(
      'torchBearerBadge', true,
      'torchBearerFounderNumber', bf.founder_number
    )
  from public.beta_founders bf
  where p.id = bf.user_id;

  -- ── Post-flight integrity checks ─────────────────────────────────────────
  select count(*)::int into v_dupes
  from (
    select founder_number
    from public.beta_founders
    group by founder_number
    having count(*) > 1
  ) d;

  if v_dupes > 0 then
    raise exception 'CQ_TORCH_BEARER_RENUMBER_ABORT: duplicate founder_number detected after migration';
  end if;

  select count(*)::int into v_total from public.beta_founders;
  select count(*)::int into v_n1 from public.beta_founders where founder_number = 1;
  select count(*)::int into v_n2 from public.beta_founders where founder_number = 2;
  select count(*)::int into v_n3 from public.beta_founders where founder_number = 3;
  select count(*)::int into v_n4 from public.beta_founders where founder_number = 4;

  if v_total <> 3 or v_n1 <> 1 or v_n2 <> 1 or v_n3 <> 1 or v_n4 <> 0 then
    raise exception
      'CQ_TORCH_BEARER_RENUMBER_ABORT: post-migration state invalid (total=%, n1=%, n2=%, n3=%, n4=%)',
      v_total, v_n1, v_n2, v_n3, v_n4;
  end if;

  -- Same slot algorithm as award_torch_bearer_badge().
  select min(g)::int into v_next
  from generate_series(1, 30) as g
  left join public.beta_founders bf on bf.founder_number = g
  where bf.founder_number is null;

  if v_next is distinct from 4 then
    raise exception 'CQ_TORCH_BEARER_RENUMBER_ABORT: next available founder number is % (expected 4)', v_next;
  end if;

  raise notice 'CQ_TORCH_BEARER_RENUMBER_OK: 3 founders renumbered 2→1, 3→2, 4→3; next slot=%', v_next;
end $$;
