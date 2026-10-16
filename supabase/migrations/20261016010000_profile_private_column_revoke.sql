-- Column-level REVOKE SELECT (private cols) is a no-op while profiles still has
-- table-level GRANT ALL / SELECT. Strip table SELECT, then re-grant only the
-- public discovery columns to anon/authenticated. Service role keeps private cols.

revoke select on table public.profiles from anon, authenticated, public;

grant select (
  id,
  username,
  display_name,
  avatar_url,
  created_at,
  updated_at,
  guild_id,
  streak_days,
  last_activity_date,
  onboarding_completed,
  onboarding_completed_at,
  onboarding_character_completed,
  avatar_custom_json,
  character_class_id,
  starter_weapon,
  scholar_guild_id,
  beginner_chain_completed_at,
  beginner_chain_celebration_seen_at,
  game_state_json,
  equipment_loadout_json,
  character_stats_json,
  display_name_changed_at,
  username_changed_at,
  starter_intro_seen_at,
  identity_weekly_change_events,
  role,
  last_active_at,
  is_test_user,
  is_hidden,
  is_internal_tester,
  qa_selected_role,
  show_xp_progress_bar,
  institution_id,
  onboarding_version,
  campus_email_verified_at,
  realm_welcome_seen_at,
  nav_hints_seen_at,
  requested_school_at,
  realm_intro_completed_at,
  is_review_demo
) on table public.profiles to anon, authenticated;

grant select (bio, major, class_year, academic_area, requested_school_name, student_status)
  on table public.profiles to service_role;
