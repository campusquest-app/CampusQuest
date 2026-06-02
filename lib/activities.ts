import type { ActivityDefinition } from "./types";
import { STAT_KEYS } from "./types";

// Real-life actions: ordered by stat (strength → stamina → knowledge → social → focus), then by statGain desc
const ACTIVITIES_RAW: ActivityDefinition[] = [
  // —— Strength 💪 ——
  { id: "gym", label: "Hit the gym", description: "Workout, lift, or cardio", stat: "strength", baseXp: 80, xp: 80, statGain: 2, icon: "🏋️" },
  { id: "weights", label: "Weights / lifting", description: "Free weights or machines", stat: "strength", baseXp: 28, xp: 28, statGain: 3, icon: "🏋️‍♂️" },
  { id: "bodyweight", label: "Push-ups or bodyweight", description: "Calisthenics at home or outside", stat: "strength", baseXp: 15, xp: 15, statGain: 2, icon: "💪" },
  { id: "sports-practice", label: "Sports practice", description: "Basketball, soccer, etc.", stat: "strength", baseXp: 22, xp: 22, statGain: 2, icon: "⚽" },
  { id: "hiit", label: "HIIT or CrossFit", description: "High-intensity interval training", stat: "strength", baseXp: 30, xp: 30, statGain: 4, icon: "🔥" },
  // —— Stamina 🏃 ——
  { id: "run", label: "Run or cardio", description: "Running, jogging, or treadmill", stat: "stamina", baseXp: 12, xp: 12, statGain: 4, icon: "🏃" },
  { id: "swim", label: "Swimming", description: "Laps or water workout", stat: "stamina", baseXp: 20, xp: 20, statGain: 5, icon: "🏊" },
  { id: "cycle", label: "Cycling", description: "Bike ride or spin class", stat: "stamina", baseXp: 16, xp: 16, statGain: 4, icon: "🚴" },
  { id: "hike", label: "Hike or long walk", description: "Trail or neighborhood walk", stat: "stamina", baseXp: 14, xp: 14, statGain: 3, icon: "🥾" },
  { id: "dance", label: "Dance or Zumba", description: "Dance class or cardio dance", stat: "stamina", baseXp: 18, xp: 18, statGain: 4, icon: "💃" },
  // —— Knowledge 📚 ——
  { id: "exam-prep", label: "Exam prep", description: "Review or practice for an exam", stat: "knowledge", baseXp: 25, xp: 25, statGain: 2, icon: "✍️", usesMinutes: true },
  { id: "study", label: "Study session", description: "Notes, reading, or practice problems", stat: "knowledge", baseXp: 20, xp: 20, statGain: 1, icon: "📖", usesMinutes: true },
  { id: "textbook", label: "Read textbook chapter", description: "Assigned reading or chapter review", stat: "knowledge", baseXp: 18, xp: 18, statGain: 1, icon: "📕", usesMinutes: true },
  { id: "office-hours", label: "Office hours or ask prof", description: "Visit TA or professor", stat: "knowledge", baseXp: 22, xp: 22, statGain: 2, icon: "🙋" },
  { id: "flashcards", label: "Flashcard review", description: "Anki or paper flashcards", stat: "knowledge", baseXp: 12, xp: 12, statGain: 1, icon: "🃏", usesMinutes: true },
  { id: "lab", label: "Lab or project work", description: "Coding, lab report, or project", stat: "knowledge", baseXp: 28, xp: 28, statGain: 3, icon: "🔬", usesMinutes: true },
  // —— Social 👥 ——
  { id: "group-study", label: "Group study", description: "Study with others", stat: "social", baseXp: 18, xp: 18, statGain: 6, icon: "📝" },
  { id: "club", label: "Club or hangout", description: "Join a club or hang with friends", stat: "social", baseXp: 10, xp: 10, statGain: 1, icon: "👥" },
  { id: "coffee-chat", label: "Coffee chat", description: "One-on-one catch-up with someone", stat: "social", baseXp: 14, xp: 14, statGain: 3, icon: "☕" },
  { id: "game-night", label: "Event or game night", description: "Board games, party, or event", stat: "social", baseXp: 16, xp: 16, statGain: 4, icon: "🎲" },
  { id: "volunteer", label: "Volunteer or org meeting", description: "Campus org or volunteer shift", stat: "social", baseXp: 20, xp: 20, statGain: 5, icon: "🤝" },
  { id: "meal-together", label: "Meal with friends", description: "Dinner or lunch with others", stat: "social", baseXp: 12, xp: 12, statGain: 2, icon: "🍽️" },
  // —— Focus 🎯 ——
  { id: "deep-focus", label: "Deep focus", description: "Uninterrupted work block (e.g. 90 min)", stat: "focus", baseXp: 15, xp: 15, statGain: 1, icon: "🎯", usesMinutes: true },
  { id: "meditate", label: "Meditate or plan", description: "Meditation or daily planning", stat: "focus", baseXp: 10, xp: 10, statGain: 4, icon: "🧘" },
  { id: "pomodoro", label: "Pomodoro block", description: "25–50 min focused session", stat: "focus", baseXp: 12, xp: 12, statGain: 2, icon: "🍅", usesMinutes: true },
  { id: "no-phone", label: "No-phone focus", description: "Phone away, single task", stat: "focus", baseXp: 14, xp: 14, statGain: 3, icon: "📵", usesMinutes: true },
  { id: "journal", label: "Journal or reflect", description: "Reflection or journaling", stat: "focus", baseXp: 10, xp: 10, statGain: 2, icon: "📓" },
  { id: "plan-week", label: "Plan your week", description: "Weekly review and schedule", stat: "focus", baseXp: 15, xp: 15, statGain: 3, icon: "📅" },
];

// Sorted by stat order (STAT_KEYS), then by statGain descending within each stat
export const ACTIVITIES: ActivityDefinition[] = ACTIVITIES_RAW.sort((a, b) => {
  const statOrder = STAT_KEYS.indexOf(a.stat) - STAT_KEYS.indexOf(b.stat);
  if (statOrder !== 0) return statOrder;
  return b.statGain - a.statGain;
});

export function getActivityById(id: string): ActivityDefinition | undefined {
  return ACTIVITIES.find((a) => a.id === id);
}

/** Activity types that deal damage to boss (study/exam-prep) */
export function isStudyActivityForBoss(activityId: string): boolean {
  return activityId === "study" || activityId === "exam-prep";
}
