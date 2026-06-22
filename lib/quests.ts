import type { DailyQuest, StatKey } from "./types";

// Seed for "today" so quests are stable per day in MVP
function getTodaySeed(): string {
  if (typeof window === "undefined") return "2025-02-21";
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const QUEST_TEMPLATES: Omit<DailyQuest, "id">[] = [
  { title: "Hit the gym", description: "Log 1 gym workout", stat: "strength", targetCount: 1, xpReward: 20, icon: "🏋️" },
  { title: "Cardio session", description: "Log 1 run or cardio", stat: "stamina", targetCount: 1, xpReward: 15, icon: "🏃" },
  { title: "Study hour", description: "Log 1 study session", stat: "knowledge", targetCount: 1, xpReward: 15, icon: "📖" },
  { title: "Socialize", description: "Log 1 club or hangout", stat: "social", targetCount: 1, xpReward: 15, icon: "👥" },
  { title: "Deep focus", description: "Complete 1 deep focus block", stat: "focus", targetCount: 1, xpReward: 25, icon: "🎯" },
  { title: "Double strength", description: "Log 2 strength activities", stat: "strength", targetCount: 2, xpReward: 30, icon: "💪" },
  { title: "Knowledge grind", description: "Log 2 knowledge activities", stat: "knowledge", targetCount: 2, xpReward: 35, icon: "📚" },
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i) | 0;
  return h;
}

export function getDailyQuests(): DailyQuest[] {
  const seed = getTodaySeed();
  const q: DailyQuest[] = [];
  for (let i = 0; i < 3; i++) {
    const idx = Math.abs(hash(`${seed}-${i}`)) % QUEST_TEMPLATES.length;
    const t = QUEST_TEMPLATES[idx];
    q.push({
      ...t,
      id: `dq-${seed}-${i}-${t.stat}`,
    });
  }
  return q;
}

