-- Fix recursive RLS policy on direct_conversation_participants.
-- The previous policy queried the same table in its USING clause,
-- which can trigger "infinite recursion detected in policy".

drop policy if exists "direct_conversation_participants own rows" on public.direct_conversation_participants;
create policy "direct_conversation_participants own rows"
on public.direct_conversation_participants for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
