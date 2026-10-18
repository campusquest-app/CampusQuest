/**
 * Purple Embers — social appreciation on Quad posts.
 *
 * Internal storage stays `reaction_type = "spark"` so historical Sparks
 * remain valid. User-facing copy is Ember / Embers. Embers never grant XP,
 * levels, coins, badges, or leaderboard progress.
 */

import { getCampusDayWindow, isOnCampusDay } from "@/lib/realm/campusTime";
import { FEATURE_FLAGS } from "@/lib/featureFlags";
import { isCampusEmailVerified } from "@/lib/campusEmailVerification";
import { selectableRoleFromStudentStatus } from "@/lib/onboarding/studentStatusRole";

/** Stored `quad_post_reactions.reaction_type` — do not rename. */
export const EMBER_REACTION_TYPE = "spark" as const;

export const DAILY_EMBER_LIMIT = 3;

export const EMBER_COLOR_ACTIVE = "#A78BFA";
export const EMBER_COLOR_IDLE = "#8B9BB4";

export const EMBER_EXPLAINER_STORAGE_KEY = "cq_embers_explained_v1";

export const EMBER_COPY = {
  name: "Ember",
  namePlural: "Embers",
  give: "Give Ember",
  remove: "Remove Ember",
  giveTitle: "Give this post an Ember",
  removeTitle: "Remove Ember",
  ownPost: "You can't give your own post an Ember.",
  explainerTitle: "What are Embers?",
  explainerBody: "Embers are a special way to appreciate standout posts. You can give 3 each day.",
  explainerAck: "Got it",
  exhausted: "You've used all 3 Embers today. More tomorrow!",
  notEligible: "Embers are for verified students.",
  notVerified: "Verify your campus email to give Embers.",
  blocked: "You can't give this post an Ember.",
  signIn: "Please sign in to give Embers.",
  demo: "Demo posts reset when you refresh. Ember real campus posts to keep your reaction.",
  saveFailed: "Could not save your Ember. Please try again.",
  notificationTitle: "Your post received an Ember!",
  notificationBody: "Someone appreciated what you shared.",
  emberSent: "Ember sent!",
  allUsedToday: "All Embers used today.",
  explainerBodyUnlimited: "Embers are a special way to appreciate standout posts.",
  receivedOne: "1 Ember received",
} as const;

export const EMBER_CAST_DURATION_MS = 2400;
export const EMBER_CAST_REDUCED_DURATION_MS = 1600;
export const EMBER_COLOR_HIGHLIGHT = "#D8B4FE";
export const EMBER_COLOR_DEEP = "#7C3AED";

export const EMBER_ERROR_CODES = {
  dailyLimit: "EMBER_DAILY_LIMIT",
  self: "EMBER_SELF_NOT_ALLOWED",
  notEligible: "EMBER_NOT_ELIGIBLE",
  notVerified: "EMBER_NOT_VERIFIED",
  blocked: "EMBER_BLOCKED",
  duplicate: "QUAD_REACTION_DUPLICATE",
} as const;

export type EmberAllowance = {
  used: number;
  remaining: number;
  limit: number;
  resetsAt: string;
  /** Exact global roles admin and super_admin. Never derived from the client. */
  unlimited?: boolean;
};

/** Unlimited daily Embers. Organization, business, and moderator roles do not qualify. */
export function hasUnlimitedDailyEmbers(role: string | null | undefined): boolean {
  return role === "admin" || role === "super_admin";
}

export type EmberGiveDecision =
  | { ok: true }
  | { ok: false; code: string; message: string };

export function campusDayWindowForEmbers(now: Date = new Date()) {
  return getCampusDayWindow(now);
}

export function countEmbersUsedToday(createdAts: Array<Date | string>, now: Date = new Date()): number {
  const { start, end } = getCampusDayWindow(now);
  let used = 0;
  for (const value of createdAts) {
    const at = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(at.getTime())) continue;
    if (at >= start && at < end) used += 1;
  }
  return used;
}

export function emberAllowanceFromUsed(used: number, now: Date = new Date()): EmberAllowance {
  const safeUsed = Math.max(0, used);
  const { end } = getCampusDayWindow(now);
  return {
    used: safeUsed,
    remaining: Math.max(0, DAILY_EMBER_LIMIT - safeUsed),
    limit: DAILY_EMBER_LIMIT,
    resetsAt: end.toISOString(),
    unlimited: false,
  };
}

export function unlimitedEmberAllowance(now: Date = new Date()): EmberAllowance {
  const { end } = getCampusDayWindow(now);
  return {
    used: 0,
    remaining: DAILY_EMBER_LIMIT,
    limit: DAILY_EMBER_LIMIT,
    resetsAt: end.toISOString(),
    unlimited: true,
  };
}

/**
 * Post totals are private. Non-owners receive 0, which the UI hides.
 * A returned 0 is not a claim that the post has no Embers.
 */
export function disclosedEmberTotal(args: {
  viewerId: string | null | undefined;
  authorId: string | null | undefined;
  count: number | null | undefined;
}): number {
  if (!args.viewerId || args.viewerId !== args.authorId) return 0;
  const count = Number(args.count ?? 0);
  if (!Number.isFinite(count)) return 0;
  return Math.max(0, Math.floor(count));
}

export function ownerEmberCountCopy(count: number): string | null {
  if (count <= 0) return null;
  if (count === 1) return EMBER_COPY.receivedOne;
  return `${count} Embers received`;
}

export function remainingEmbersCopy(remaining: number): string {
  const left = Math.max(0, Math.min(DAILY_EMBER_LIMIT, remaining));
  if (left === 0) return EMBER_COPY.exhausted;
  return `${left} of ${DAILY_EMBER_LIMIT} Embers left today`;
}

export function emberCastRemainingLabel(remaining: number): string {
  const left = Math.max(0, Math.min(DAILY_EMBER_LIMIT, remaining));
  if (left === 0) return EMBER_COPY.allUsedToday;
  if (left === 1) return "1 Ember remaining.";
  return `${left} Embers remaining.`;
}

export type EmberCastPlan = {
  startingCount: 1 | 2 | 3;
  remainingCount: 0 | 1 | 2;
  consumeIndex: number;
  remainingLabel: string;
  confirmationDetail: string;
  exhausted: boolean;
  /** Admins do not show a decreasing daily balance. */
  unlimited: boolean;
};

/** Plan the consumption spell from the authoritative remaining count after a successful give. */
export function planEmberCast(remainingAfter: number): EmberCastPlan {
  const remainingCount = Math.max(0, Math.min(DAILY_EMBER_LIMIT - 1, Math.floor(remainingAfter))) as 0 | 1 | 2;
  const startingCount = (remainingCount + 1) as 1 | 2 | 3;
  return {
    startingCount,
    remainingCount,
    consumeIndex: startingCount === 2 ? 1 : 0,
    remainingLabel: emberCastRemainingLabel(remainingCount),
    confirmationDetail: remainingEmbersCopy(remainingCount),
    exhausted: remainingCount === 0,
    unlimited: false,
  };
}

/** One flame, a short trail, and a confirmation. No balance, infinity mark, or admin badge. */
export function planUnlimitedEmberCast(): EmberCastPlan {
  return {
    startingCount: 1,
    remainingCount: 0,
    consumeIndex: 0,
    remainingLabel: "",
    confirmationDetail: "",
    exhausted: false,
    unlimited: true,
  };
}

export type EmberFlameSlot = { x: number; y: number };

export function emberCastFlameSlots(startingCount: 1 | 2 | 3): EmberFlameSlot[] {
  if (startingCount === 1) return [{ x: 0, y: 0 }];
  if (startingCount === 2) return [{ x: -18, y: 2 }, { x: 18, y: 2 }];
  return [
    { x: 0, y: -20 },
    { x: -20, y: 12 },
    { x: 20, y: 12 },
  ];
}

export function clampEmberCastAnchor(args: {
  button: { left: number; top: number; width: number; height: number };
  viewport: { width: number; height: number };
}): { left: number; top: number } {
  const overlayW = 168;
  const overlayH = 176;
  const navReserve = 92;
  const edge = 16;
  let left = args.button.left + args.button.width / 2;
  let top = args.button.top - 12;
  const minLeft = edge + overlayW / 2;
  const maxLeft = args.viewport.width - edge - overlayW / 2;
  const minTop = edge + overlayH;
  const maxTop = args.viewport.height - navReserve;
  left = Math.min(maxLeft, Math.max(minLeft, left));
  top = Math.min(maxTop, Math.max(minTop, top));
  return { left, top };
}

export function sameDayRemovalRestoresAvailability(givenAt: Date | string, now: Date = new Date()): boolean {
  const at = givenAt instanceof Date ? givenAt : new Date(givenAt);
  if (Number.isNaN(at.getTime())) return false;
  return isOnCampusDay(at, now);
}

export function decideEmberGive(args: {
  usedToday: number;
  alreadyActive: boolean;
  isOwnPost: boolean;
  unlimited?: boolean;
}): EmberGiveDecision {
  if (args.isOwnPost) {
    return { ok: false, code: EMBER_ERROR_CODES.self, message: EMBER_COPY.ownPost };
  }
  if (args.alreadyActive) {
    return { ok: false, code: EMBER_ERROR_CODES.duplicate, message: "You already gave this post an Ember." };
  }
  if (!args.unlimited && args.usedToday >= DAILY_EMBER_LIMIT) {
    return { ok: false, code: EMBER_ERROR_CODES.dailyLimit, message: EMBER_COPY.exhausted };
  }
  return { ok: true };
}

/** After a concurrent insert, roll back if this user now exceeds the daily cap. */
export function shouldRollbackOverLimitInsert(usedAfterInsert: number, unlimited = false): boolean {
  if (unlimited) return false;
  return usedAfterInsert > DAILY_EMBER_LIMIT;
}

export function isEligibleEmberGiver(profile: {
  role?: string | null;
  student_status?: string | null;
  campus_email_verified_at?: string | null;
}): EmberGiveDecision {
  const role = profile.role ?? null;
  const mapped = selectableRoleFromStudentStatus(profile.student_status);
  const isPrivileged =
    role === "admin" || role === "super_admin" || role === "qa" || role === "beta_internal";
  const isStudent = role === "student" || mapped === "student";
  if (!isPrivileged && !isStudent) {
    return { ok: false, code: EMBER_ERROR_CODES.notEligible, message: EMBER_COPY.notEligible };
  }
  if (FEATURE_FLAGS.requireEmailVerification && !isCampusEmailVerified(profile)) {
    return { ok: false, code: EMBER_ERROR_CODES.notVerified, message: EMBER_COPY.notVerified };
  }
  return { ok: true };
}

/**
 * Historical Sparks stay in quad_post_reactions and are not deleted.
 * They remain part of the author's private total. They consume today's
 * allowance only when created_at falls on the current America/New_York day.
 * Removing one from a previous day does not restore today's allowance.
 */
export function historicalSparkCountsTowardToday(createdAt: Date | string, now: Date = new Date()): boolean {
  return sameDayRemovalRestoresAvailability(createdAt, now);
}
