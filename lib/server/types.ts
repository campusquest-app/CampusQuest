export type ProfileRow = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio: string;
  streak_days?: number | null;
  last_activity_date?: string | null;
  created_at: string;
  updated_at: string;
  onboarding_completed?: boolean | null;
  onboarding_completed_at?: string | null;
  onboarding_character_completed?: boolean | null;
  avatar_custom_json?: string | null;
  character_class_id?: string | null;
  starter_weapon?: string | null;
  scholar_guild_id?: string | null;
  /** QA/test account flags — see lib/server/qaTestAccount.ts. */
  is_test_user?: boolean | null;
  is_hidden?: boolean | null;
  role?: string | null;
  /** QA accounts store their role-selection test choice here; role stays 'qa'. */
  qa_selected_role?: string | null;
};

export type UserStatsRow = {
  user_id: string;
  level: number;
  total_xp: number;
  quests_completed?: number;
  strength: number;
  stamina: number;
  knowledge: number;
  social: number;
  focus: number;
  created_at: string;
  updated_at: string;
};

export type PlayerProgressSnapshot = {
  profile: {
    id: string;
    streak_days: number;
    last_activity_date: string | null;
  };
  stats: UserStatsRow;
  progression: {
    level: number;
    totalXp: number;
    currentLevelXp: number;
    nextLevelRequiredXp: number;
    progress: number;
  };
};

