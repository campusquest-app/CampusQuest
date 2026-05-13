-- Persist beginner-chain completion + one-time celebration acknowledgment (no repeat after refresh/login).

alter table public.profiles
  add column if not exists beginner_chain_completed_at timestamptz,
  add column if not exists beginner_chain_celebration_seen_at timestamptz;

-- Completed timestamp for users who already claimed all five keys (retroactive).
update public.profiles p
set beginner_chain_completed_at = sub.last_claim_at
from (
  select user_id, max(created_at) as last_claim_at
  from public.user_beginner_quest_claims
  group by user_id
  having count(distinct quest_key) >= 5
) sub
where p.id = sub.user_id
  and p.beginner_chain_completed_at is null;

-- Users who already finished the chain: treat celebration as acknowledged so deploy does not re-show every refresh.
update public.profiles p
set beginner_chain_celebration_seen_at = coalesce(p.beginner_chain_celebration_seen_at, now())
where p.beginner_chain_completed_at is not null
  and p.beginner_chain_celebration_seen_at is null;
