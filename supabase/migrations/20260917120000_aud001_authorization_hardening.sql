-- AUD-001: authorization hardening at the database boundary.
--
-- Verification state, moderation flags, organization authority, relationship
-- state, conversation membership, Quad visibility, game economy (XP, rewards,
-- inventory, leaderboard totals) and marketplace workflow must be authoritative
-- in Postgres, not freely writable from a browser Supabase client.
--
-- Forward-only. Idempotent where practical: every policy is dropped with
-- DROP POLICY IF EXISTS before an explicit CREATE POLICY.
--
-- Existing protections are preserved and intentionally NOT duplicated:
--   profiles.role                     -> public.block_profiles_role_escalation()
--   profiles.campus_email_verified_at -> public.protect_campus_email_verified_at()
--   quad_posts posting identity       -> public.enforce_quad_post_posted_as()
--   marketplace listing identity      -> public.enforce_marketplace_listing_identity()
--   student business verification     -> public.prevent_marketplace_verification_spoof()
-- public.enforce_marketplace_offer_update() is extended (not replaced) below to
-- close the student-business-manager bypass while keeping buyer/seller rules.

-- ===========================================================================
-- 0. Shared helpers
-- ===========================================================================

-- Trust test used by every trigger below. It is a strict version of the check
-- already used by protect_campus_email_verified_at(): whenever a PostgREST
-- request context exists (any browser or API call), only `service_role` is
-- trusted, so a request that somehow arrives without a resolvable role is
-- treated as hostile. With no request context at all (migrations, psql, cron)
-- the session is an owner session and is trusted.
create or replace function public.cq_is_trusted_writer()
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select case
    when coalesce(current_setting('request.jwt.claims', true), '') <> ''
      or coalesce(current_setting('request.jwt.claim.role', true), '') <> ''
      then coalesce(auth.role(), '') = 'service_role'
    else coalesce(auth.role(), '') not in ('authenticated', 'anon')
  end;
$$;

comment on function public.cq_is_trusted_writer() is
  'True for service-role / owner sessions. Browser (authenticated, anon) sessions are never trusted.';

-- Block state relative to the *caller only*. SECURITY DEFINER because
-- blocked_users RLS exposes rows the caller created, not rows created against
-- them; the caller identity comes from auth.uid() and is never an argument.
create or replace function public.cq_viewer_blocked_with(p_other_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.blocked_users b
    where (b.blocker_id = auth.uid() and b.blocked_id = p_other_user_id)
       or (b.blocker_id = p_other_user_id and b.blocked_id = auth.uid())
  );
$$;

revoke all on function public.cq_viewer_blocked_with(uuid) from public;
grant execute on function public.cq_viewer_blocked_with(uuid) to authenticated;

-- True when the caller is a participant of the conversation and any other
-- participant is blocked in either direction. Non-participants always get false.
create or replace function public.cq_conversation_blocked_for_viewer(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.direct_conversation_participants me
    where me.conversation_id = p_conversation_id
      and me.user_id = auth.uid()
  )
  and exists (
    select 1
    from public.direct_conversation_participants other
    join public.blocked_users b
      on (b.blocker_id = auth.uid() and b.blocked_id = other.user_id)
      or (b.blocked_id = auth.uid() and b.blocker_id = other.user_id)
    where other.conversation_id = p_conversation_id
      and other.user_id <> auth.uid()
  );
$$;

revoke all on function public.cq_conversation_blocked_for_viewer(uuid) from public;
grant execute on function public.cq_conversation_blocked_for_viewer(uuid) to authenticated;

-- Approved organization authority for the caller. SECURITY DEFINER so the
-- answer does not depend on the caller's read policies. The predicate is
-- deliberately identical to assertOrganizationAdmin/Owner in
-- lib/server/organizationManagement.ts: approved status plus org_role, and
-- nothing else (legacy role='manager' rows were migrated to org_role='admin'
-- by 20260513024500_org_members_role_compat.sql).
create or replace function public.cq_viewer_org_role(p_organization_id uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select m.org_role
  from public.organization_members m
  where m.organization_id = p_organization_id
    and m.user_id = auth.uid()
    and m.status = 'approved'
    and m.org_role in ('owner', 'admin')
  limit 1;
$$;

revoke all on function public.cq_viewer_org_role(uuid) from public;
grant execute on function public.cq_viewer_org_role(uuid) to authenticated;

-- ===========================================================================
-- A. user_school_verifications - verification state is server-owned
-- ===========================================================================
-- Clients could previously upsert status='verified' with any school_domain,
-- which is the gate for campus leaderboards, org tooling and campus scoping.
-- lib/server/schoolVerification.ts now writes with the service-role client
-- after deriving the domain from the authenticated auth.users record.

drop policy if exists "user_school_verifications upsert own" on public.user_school_verifications;
drop policy if exists "user_school_verifications update own" on public.user_school_verifications;

drop policy if exists "user_school_verifications read own" on public.user_school_verifications;
create policy "user_school_verifications read own"
on public.user_school_verifications for select
to authenticated
using (auth.uid() = user_id);

-- ===========================================================================
-- B. organization_members - self-service join/follow without authority grants
-- ===========================================================================
-- Self INSERT/UPDATE previously allowed org_role='owner', status='approved'
-- and membership_kind changes, i.e. instant takeover of any organization
-- (org identity posting, announcements, member management).

drop policy if exists "organization_members upsert self" on public.organization_members;
create policy "organization_members upsert self"
on public.organization_members for insert
to authenticated
with check (
  auth.uid() = user_id
  and coalesce(org_role, 'member') = 'member'
  and coalesce(role, 'member') in ('member', 'follower')
  and coalesce(membership_kind, 'member') in ('member', 'follower')
  and coalesce(status, 'approved') = 'approved'
  and exists (
    select 1
    from public.student_organizations o
    where o.id = organization_id
      and (
        coalesce(membership_kind, 'member') = 'follower'
        or coalesce(o.require_join_approval, false) = false
      )
  )
);

-- "organization_members update self" (20260513010000) is a second, permissive
-- UPDATE policy; RLS OR's policies, so it is removed and its legitimate part
-- (auth.uid() = user_id) is folded into the single policy below.
drop policy if exists "organization_members update self" on public.organization_members;

drop policy if exists "organization_members update owner admin" on public.organization_members;
create policy "organization_members update owner admin"
on public.organization_members for update
to authenticated
using (
  auth.uid() = user_id
  or public.cq_viewer_org_role(organization_id) in ('owner', 'admin')
)
with check (
  auth.uid() = user_id
  or public.cq_viewer_org_role(organization_id) in ('owner', 'admin')
);

create or replace function public.enforce_organization_member_write()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_role text;
  requires_approval boolean;
begin
  if public.cq_is_trusted_writer() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Self-service join/follow only. Authority is granted by the server
    -- (organization creation, join-request approval, ownership transfer).
    new.user_id := coalesce(auth.uid(), new.user_id);
    new.org_role := 'member';
    new.status := 'approved';
    new.membership_kind := coalesce(new.membership_kind, 'member');
    if new.membership_kind not in ('member', 'follower') then
      new.membership_kind := 'member';
    end if;
    if coalesce(new.role, 'member') not in ('member', 'follower') then
      new.role := 'member';
    end if;

    if new.membership_kind = 'member' then
      select coalesce(o.require_join_approval, false)
        into requires_approval
      from public.student_organizations o
      where o.id = new.organization_id;
      if coalesce(requires_approval, false) then
        raise exception 'ORG_JOIN_REQUIRES_APPROVAL';
      end if;
    end if;
    return new;
  end if;

  if new.organization_id is distinct from old.organization_id
     or new.user_id is distinct from old.user_id then
    raise exception 'organization membership identity is immutable';
  end if;

  actor_role := public.cq_viewer_org_role(old.organization_id);

  -- Owners keep full authority over the roster, including their own row
  -- (self-demotion / ownership handover already happens through the server).
  if actor_role = 'owner' then
    if coalesce(new.org_role, 'member') not in ('owner', 'admin', 'member') then
      raise exception 'invalid organization role';
    end if;
    return new;
  end if;

  if auth.uid() = old.user_id then
    -- Own row, no org authority: join/follow upserts resend org_role/status, so
    -- keep the stored values instead of failing the otherwise legitimate write.
    -- This is what stops self-promotion to owner/admin and self-approval.
    new.org_role := old.org_role;
    new.status := old.status;
    new.role := old.role;
    if new.membership_kind is distinct from old.membership_kind then
      if new.membership_kind not in ('member', 'follower') then
        raise exception 'invalid organization membership kind';
      end if;
      if new.membership_kind = 'member' then
        select coalesce(o.require_join_approval, false)
          into requires_approval
        from public.student_organizations o
        where o.id = old.organization_id;
        if coalesce(requires_approval, false) then
          raise exception 'ORG_JOIN_REQUIRES_APPROVAL';
        end if;
      end if;
    end if;
    return new;
  end if;

  if actor_role = 'admin' then
    if old.org_role = 'owner' then
      raise exception 'admins cannot modify the organization owner';
    end if;
    if new.org_role is distinct from old.org_role then
      raise exception 'only the organization owner may change member roles';
    end if;
    return new;
  end if;

  raise exception 'not allowed to modify this organization membership';
end;
$$;

drop trigger if exists trg_enforce_organization_member_write on public.organization_members;
create trigger trg_enforce_organization_member_write
before insert or update on public.organization_members
for each row execute function public.enforce_organization_member_write();

-- ===========================================================================
-- C. direct_conversation_participants - membership is server-owned
-- ===========================================================================
-- FOR ALL (auth.uid() = user_id) let a removed group member re-insert their own
-- participant row and rejoin a conversation. Every legitimate insert/delete in
-- lib/server/messaging.ts already runs on the service-role client; clients only
-- need to update their own read/hidden markers.

drop policy if exists "direct_conversation_participants own rows" on public.direct_conversation_participants;

drop policy if exists "direct_conversation_participants read own" on public.direct_conversation_participants;
create policy "direct_conversation_participants read own"
on public.direct_conversation_participants for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "direct_conversation_participants update own markers" on public.direct_conversation_participants;
create policy "direct_conversation_participants update own markers"
on public.direct_conversation_participants for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create or replace function public.enforce_dm_participant_self_update()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if public.cq_is_trusted_writer() then
    return new;
  end if;
  new.conversation_id := old.conversation_id;
  new.user_id := old.user_id;
  new.role := old.role;
  new.joined_at := old.joined_at;
  return new;
end;
$$;

drop trigger if exists trg_enforce_dm_participant_self_update on public.direct_conversation_participants;
create trigger trg_enforce_dm_participant_self_update
before update on public.direct_conversation_participants
for each row execute function public.enforce_dm_participant_self_update();

-- ===========================================================================
-- D. direct_messages - blocks enforced at the database boundary
-- ===========================================================================
-- Sender INSERT verified conversation membership but not blocks, so a blocked
-- user could keep writing into an existing thread by calling PostgREST directly.

drop policy if exists "direct_messages sender insert" on public.direct_messages;
create policy "direct_messages sender insert"
on public.direct_messages for insert
to authenticated
with check (
  auth.uid() = sender_id
  and exists (
    select 1
    from public.direct_conversation_participants dcp
    where dcp.conversation_id = direct_messages.conversation_id
      and dcp.user_id = auth.uid()
  )
  and not public.cq_conversation_blocked_for_viewer(direct_messages.conversation_id)
);

-- ===========================================================================
-- E. student_connections - relationship state transitions
-- ===========================================================================
-- FOR ALL (requester or addressee) allowed inserting a row that is already
-- status='accepted', or rewriting requester_id on an incoming request, i.e.
-- forging a friendship that unlocks friends-only posts and DMs.
-- sendConnectionRequest() already writes with the service-role client.

drop policy if exists "student_connections own rows" on public.student_connections;

drop policy if exists "student_connections read own" on public.student_connections;
create policy "student_connections read own"
on public.student_connections for select
to authenticated
using (auth.uid() = requester_id or auth.uid() = addressee_id);

drop policy if exists "student_connections addressee respond" on public.student_connections;
create policy "student_connections addressee respond"
on public.student_connections for update
to authenticated
using (auth.uid() = addressee_id and status = 'pending')
with check (auth.uid() = addressee_id and status in ('accepted', 'declined'));

drop policy if exists "student_connections party delete" on public.student_connections;
create policy "student_connections party delete"
on public.student_connections for delete
to authenticated
using (auth.uid() = requester_id or auth.uid() = addressee_id);

create or replace function public.enforce_student_connection_transition()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if public.cq_is_trusted_writer() then
    return new;
  end if;
  if new.requester_id is distinct from old.requester_id
     or new.addressee_id is distinct from old.addressee_id then
    raise exception 'connection participants are immutable';
  end if;
  if new.status is distinct from old.status then
    if old.status is distinct from 'pending' then
      raise exception 'only pending connection requests can be answered';
    end if;
    if auth.uid() is distinct from old.addressee_id then
      raise exception 'only the addressee can answer a connection request';
    end if;
    if new.status not in ('accepted', 'declined') then
      raise exception 'invalid connection status transition';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_student_connection_transition on public.student_connections;
create trigger trg_enforce_student_connection_transition
before update on public.student_connections
for each row execute function public.enforce_student_connection_transition();

-- ===========================================================================
-- F. quad_posts - real SELECT visibility instead of "any authenticated user"
-- ===========================================================================
-- Reuses the predicate already enforced on quad_post_media / post_tags /
-- post_mentions, plus the block and hidden-account rules the API applies.

drop policy if exists "Authenticated users read quad posts" on public.quad_posts;
drop policy if exists "quad_posts select visible" on public.quad_posts;
create policy "quad_posts select visible"
on public.quad_posts for select
to authenticated
using (
  quad_posts.user_id = auth.uid()
  or (
    (
      quad_posts.visibility = 'public'
      or (
        quad_posts.visibility = 'friends'
        and exists (
          select 1
          from public.student_connections c
          where c.status = 'accepted'
            and (
              (c.requester_id = auth.uid() and c.addressee_id = quad_posts.user_id)
              or (c.addressee_id = auth.uid() and c.requester_id = quad_posts.user_id)
            )
        )
      )
    )
    and not public.cq_viewer_blocked_with(quad_posts.user_id)
    and not exists (
      select 1
      from public.profiles author
      where author.id = quad_posts.user_id
        and (
          coalesce(author.is_hidden, false)
          or coalesce(author.is_test_user, false)
          or coalesce(author.role, '') = 'qa'
        )
    )
  )
);

-- ===========================================================================
-- G. boss_attempts - combat results are server-computed
-- ===========================================================================
-- Own-row INSERT let a client post arbitrary `damage` / `was_killing_blow`,
-- which drives boss defeat, XP rewards and loot. attemptBossBattle() now
-- inserts with the trusted server client after computing damage.

drop policy if exists "users can insert own boss attempts" on public.boss_attempts;

drop policy if exists "users can view own boss attempts" on public.boss_attempts;
create policy "users can view own boss attempts"
on public.boss_attempts for select
to authenticated
using (auth.uid() = user_id);

-- Legacy local-game sync also accepted arbitrary boss-drop reward rows and
-- could turn caller-selected catalog slugs into inventory grants. The
-- authenticated POST endpoint is now read-only/deny; trusted combat already
-- grants loot through attemptBossBattle().
drop policy if exists "Users insert own boss drops" on public.boss_drops;

-- ===========================================================================
-- H. guilds - owner metadata edits without leaderboard economy writes
-- ===========================================================================

create or replace function public.enforce_guild_economy_fields()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if public.cq_is_trusted_writer() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.owner_id := coalesce(auth.uid(), new.owner_id);
    new.total_xp := 0;
    new.member_count := 1;
    return new;
  end if;
  new.owner_id := old.owner_id;
  new.total_xp := old.total_xp;
  new.member_count := old.member_count;
  return new;
end;
$$;

drop trigger if exists trg_enforce_guild_economy_fields on public.guilds;
create trigger trg_enforce_guild_economy_fields
before insert or update on public.guilds
for each row execute function public.enforce_guild_economy_fields();

-- ===========================================================================
-- I. user_stats - remove the permissive policy that defeated the hardening
-- ===========================================================================
-- CRITICAL: RLS policies are OR'ed. The legacy "user_stats insert own row"
-- policy (001_initial_schema.sql) allowed any values and therefore nullified
-- the hardened all-zero "users insert own stats" policy.

drop policy if exists "user_stats insert own row" on public.user_stats;
drop policy if exists "user_stats update own row" on public.user_stats;
drop policy if exists "users update own stats" on public.user_stats;

drop policy if exists "users insert own stats" on public.user_stats;
create policy "users insert own stats"
on public.user_stats for insert
to authenticated
with check (
  auth.uid() = user_id
  and coalesce(total_xp, 0) = 0
  and coalesce(level, 1) = 1
  and coalesce(strength, 0) = 0
  and coalesce(stamina, 0) = 0
  and coalesce(knowledge, 0) = 0
  and coalesce(social, 0) = 0
  and coalesce(focus, 0) = 0
  and coalesce(bosses_defeated, 0) = 0
  and coalesce(final_bosses_defeated, 0) = 0
  and coalesce(quests_completed, 0) = 0
  and coalesce(current_streak, 0) = 0
  and coalesce(longest_streak, 0) = 0
  and coalesce(streak_saves, 0) = 0
);

-- ===========================================================================
-- J. user_inventory - item grants and consumption are server-owned
-- ===========================================================================
-- Own-row INSERT/UPDATE/DELETE allowed minting any catalog item in any
-- quantity. addItemToInventory() now writes with the trusted server client.

drop policy if exists "users can insert own inventory items" on public.user_inventory;
drop policy if exists "users can update own inventory items" on public.user_inventory;
drop policy if exists "users can delete own inventory items" on public.user_inventory;

drop policy if exists "users can view own inventory" on public.user_inventory;
create policy "users can view own inventory"
on public.user_inventory for select
to authenticated
using (auth.uid() = user_id);

-- ===========================================================================
-- K. marketplace_offers - close the student-business-manager bypass
-- ===========================================================================
-- The previous trigger only had a buyer branch and a seller branch. A manager
-- of the listing's business is neither, so no branch matched and they could set
-- any status, including reopening or withdrawing somebody else's offer.

create or replace function public.enforce_marketplace_offer_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor uuid := auth.uid();
  listing_seller uuid;
  listing_business uuid;
  actor_manages_business boolean := false;
begin
  if public.cq_is_trusted_writer() then
    return new;
  end if;

  if new.listing_id is distinct from old.listing_id
     or new.buyer_id is distinct from old.buyer_id
     or new.amount_cents is distinct from old.amount_cents then
    raise exception 'marketplace offer identity fields are immutable';
  end if;

  select l.seller_id, l.business_id
    into listing_seller, listing_business
  from public.marketplace_listings l
  where l.id = old.listing_id;

  -- Reuses the existing marketplace helper so manager authority stays defined
  -- in exactly one place (public.student_business_members, role owner/admin).
  if listing_business is not null then
    actor_manages_business := public.is_student_business_manager(listing_business);
  end if;

  if new.status is distinct from old.status then
    if old.status is distinct from 'pending' then
      raise exception 'only pending marketplace offers can change status';
    end if;
    if actor = old.buyer_id then
      if new.status is distinct from 'withdrawn' then
        raise exception 'buyers may only withdraw their own offers';
      end if;
    elsif actor = listing_seller or actor_manages_business then
      if new.status not in ('accepted', 'declined') then
        raise exception 'sellers may only accept or decline offers';
      end if;
    else
      raise exception 'only the buyer or the listing seller may change this offer';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_marketplace_offer_update on public.marketplace_offers;
create trigger trg_enforce_marketplace_offer_update
before update on public.marketplace_offers
for each row execute function public.enforce_marketplace_offer_update();

-- ===========================================================================
-- L. profiles - server-owned moderation / progression columns
-- ===========================================================================
-- Broad "users update own profile" is kept for legitimate identity and
-- presentation edits. This trigger only freezes columns the server owns; it
-- deliberately does not touch `role` or `campus_email_verified_at`, which
-- already have dedicated triggers.
--
-- game_state_json keeps the same allowlist the API applies
-- (lib/server/profileSecurity.ts CLIENT_GAME_STATE_JSON_KEYS): client keys are
-- taken from the submitted document (so unequipping still persists) and every
-- other key - achievements, qrMilestones, ... - is restored from the old row.
-- Legacy stat/loadout snapshots, guild membership, completion state, activity
-- telemetry and identity-change enforcement metadata are also server-owned.

create or replace function public.protect_profile_server_owned_fields()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  client_game_state_keys constant text[] := array[
    'equippedCosmetics',
    'equippedTitleId'
  ];
  client_part jsonb;
  server_part jsonb;
begin
  if public.cq_is_trusted_writer() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.is_hidden := false;
    new.is_test_user := false;
    new.is_internal_tester := false;
    new.qa_selected_role := null;
    new.streak_days := 0;
    new.last_activity_date := null;
    new.last_active_at := null;
    new.guild_id := null;
    new.equipment_loadout_json := '{}'::jsonb;
    new.character_stats_json := '{}'::jsonb;
    new.beginner_chain_completed_at := null;
    new.onboarding_completed := false;
    new.onboarding_completed_at := null;
    new.display_name_changed_at := null;
    new.username_changed_at := null;
    new.identity_weekly_change_events := '[]'::jsonb;
    new.requested_school_at := null;

    select coalesce(jsonb_object_agg(entry.key, entry.value), '{}'::jsonb)
      into client_part
    from jsonb_each(
      case
        when jsonb_typeof(coalesce(new.game_state_json, '{}'::jsonb)) = 'object'
          then coalesce(new.game_state_json, '{}'::jsonb)
        else '{}'::jsonb
      end
    ) as entry
    where entry.key = any (client_game_state_keys);
    new.game_state_json := coalesce(client_part, '{}'::jsonb);
    return new;
  end if;

  new.is_hidden := old.is_hidden;
  new.is_test_user := old.is_test_user;
  new.is_internal_tester := old.is_internal_tester;
  new.qa_selected_role := old.qa_selected_role;
  new.streak_days := old.streak_days;
  new.last_activity_date := old.last_activity_date;
  new.last_active_at := old.last_active_at;
  new.guild_id := old.guild_id;
  new.equipment_loadout_json := old.equipment_loadout_json;
  new.character_stats_json := old.character_stats_json;
  new.beginner_chain_completed_at := old.beginner_chain_completed_at;
  new.onboarding_completed := old.onboarding_completed;
  new.onboarding_completed_at := old.onboarding_completed_at;
  new.display_name_changed_at := old.display_name_changed_at;
  new.username_changed_at := old.username_changed_at;
  new.identity_weekly_change_events := old.identity_weekly_change_events;
  new.requested_school_at := old.requested_school_at;

  if new.game_state_json is distinct from old.game_state_json then
    select coalesce(jsonb_object_agg(entry.key, entry.value), '{}'::jsonb)
      into client_part
    from jsonb_each(
      case
        when jsonb_typeof(coalesce(new.game_state_json, '{}'::jsonb)) = 'object'
          then coalesce(new.game_state_json, '{}'::jsonb)
        else '{}'::jsonb
      end
    ) as entry
    where entry.key = any (client_game_state_keys);

    select coalesce(jsonb_object_agg(entry.key, entry.value), '{}'::jsonb)
      into server_part
    from jsonb_each(
      case
        when jsonb_typeof(coalesce(old.game_state_json, '{}'::jsonb)) = 'object'
          then coalesce(old.game_state_json, '{}'::jsonb)
        else '{}'::jsonb
      end
    ) as entry
    where not (entry.key = any (client_game_state_keys));

    new.game_state_json := coalesce(client_part, '{}'::jsonb) || coalesce(server_part, '{}'::jsonb);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_protect_profile_server_owned_fields on public.profiles;
create trigger trg_protect_profile_server_owned_fields
before insert or update on public.profiles
for each row execute function public.protect_profile_server_owned_fields();

comment on function public.protect_profile_server_owned_fields() is
  'AUD-001: freezes moderation/test flags, progression, membership, telemetry, identity enforcement metadata and server-owned game state against browser writes.';
