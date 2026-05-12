export type ProfileRow = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio: string;
  created_at: string;
  updated_at: string;
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

