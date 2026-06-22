import { DAILY_MINIMUM_XP } from "@/lib/level";

/** Local hour (0–23) when streak danger messaging may appear. */
export const STREAK_DANGER_HOUR = 20;

export function isStreakDangerWindow(now: Date = new Date()): boolean {
  return now.getHours() >= STREAK_DANGER_HOUR;
}

export function isStreakCreditEarned(todayXp: number): boolean {
  return todayXp >= DAILY_MINIMUM_XP;
}

export function formatStreakTitle(streakDays: number): string {
  if (streakDays <= 0) return "🔥 Begin Your Streak";
  return `🔥 ${streakDays}-Day Streak`;
}

export function streakSubtitle(streakDays: number, todayXp: number): string {
  if (streakDays <= 0) {
    return "Your daily flame is waiting to be lit.";
  }
  if (isStreakCreditEarned(todayXp)) {
    return "Today's flame is secured. Return tomorrow to keep it burning.";
  }
  return "Keep your adventure alive.";
}

export function streakXpProgressLine(todayXp: number): string {
  return `${todayXp} / ${DAILY_MINIMUM_XP} XP earned today`;
}

export function streakProtectionLine(streakDays: number, todayXp: number): string {
  if (isStreakCreditEarned(todayXp)) {
    return "You're set for today — come back after midnight for the next chapter.";
  }
  if (streakDays <= 0) {
    return `Complete an activity before midnight to earn ${DAILY_MINIMUM_XP} XP and begin your streak.`;
  }
  return "Complete an activity before midnight to protect your streak.";
}

export function shouldShowStreakDanger(
  streakDays: number,
  todayXp: number,
  now: Date = new Date(),
): boolean {
  return streakDays > 0 && !isStreakCreditEarned(todayXp) && isStreakDangerWindow(now);
}

export function hasStreakFreezeAvailable(streakFreezes: number | undefined | null): boolean {
  return (streakFreezes ?? 0) > 0;
}

export const STREAK_FREEZE_LABEL = "🧊 Streak Freeze Available";
export const STREAK_DANGER_TITLE = "⚠️ Streak in Danger";
export const STREAK_DANGER_BODY = "Only a few hours remain to earn today's streak credit.";

/** Compact badge for profiles, feed, and friend lists. */
export function formatStreakBadge(streakDays: number): string | null {
  if (streakDays < 1) return null;
  return `🔥 ${streakDays}-Day Streak`;
}

export type TopNavStreakStatus = "none" | "active" | "secured" | "at_risk";

export function resolveTopNavStreakStatus(
  streakDays: number,
  todayXp: number,
  now: Date = new Date(),
): TopNavStreakStatus {
  if (streakDays <= 0) return "none";
  if (isStreakCreditEarned(todayXp)) return "secured";
  if (shouldShowStreakDanger(streakDays, todayXp, now)) return "at_risk";
  return "active";
}

/** One-line streak copy for the top nav progress strip. */
export function formatTopNavStreakLine(
  streakDays: number,
  todayXp: number,
  now: Date = new Date(),
): string {
  const base = streakDays > 0 ? `🔥 ${streakDays}-Day Streak` : "🔥 Begin Your Streak";
  const status = resolveTopNavStreakStatus(streakDays, todayXp, now);
  if (status === "secured") return `${base} • Secured`;
  if (status === "at_risk") return `${base} • Protect today`;
  return base;
}
