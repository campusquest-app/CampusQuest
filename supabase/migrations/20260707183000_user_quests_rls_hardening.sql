-- Prevent client-side quest progress / completion cheating via Supabase JS client.

-- user_quests: users may read their own rows; mutations are service-role only.
drop policy if exists "users can manage own user quests" on public.user_quests;
drop policy if exists "user_quests manage own" on public.user_quests;

drop policy if exists "users read own user quests" on public.user_quests;
create policy "users read own user quests"
on public.user_quests for select
to authenticated
using (auth.uid() = user_id);

-- quest_completions: users may read (leaderboards/achievements); inserts are service-role only.
drop policy if exists "users can insert own quest completions" on public.quest_completions;
drop policy if exists "quest_completions insert own" on public.quest_completions;
