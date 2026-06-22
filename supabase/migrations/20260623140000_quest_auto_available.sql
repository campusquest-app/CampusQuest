-- Quests are auto-available: user_quests rows are created on first progress, not on accept.

comment on table public.user_quests is 'Per-user quest progress. Rows are created when a user first makes progress or completes a quest — no accept step required.';
