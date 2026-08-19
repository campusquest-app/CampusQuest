import type { MeProfileRow } from "@/lib/client/profileCharacter";

/**
 * Beginner-chain / "New Player Protocol" tutorial overlays.
 * Demographic onboarding is controlled separately by
 * `DEMOGRAPHIC_ONBOARDING_ENABLED` in lib/onboarding/demographicOnboardingPolicy.ts.
 */
export const ONBOARDING_TUTORIAL_DISABLED = true;

export function isOnboardingTutorialDisabled(): boolean {
  return ONBOARDING_TUTORIAL_DISABLED;
}

export const BEGINNER_CHAIN_QUEST_IDS = ["profile", "activity", "boss", "leaderboard", "guild"] as const;

/** Minimal beginner status shape (avoids importing `beginnerOnboardingHydration`, which imports this module). */
export type BeginnerClaimsShape = {
  claims: { questKey: string }[];
  beginnerChainCelebrationSeenAt?: string | null;
  beginnerChainCompletedAt?: string | null;
};

export type ProfileTutorialFlagSnapshot = Pick<
  MeProfileRow,
  | "onboarding_completed"
  | "starter_intro_seen_at"
  | "beginner_chain_completed_at"
  | "beginner_chain_celebration_seen_at"
>;

/** Beginner-chain + celebration fully resolved (hide checklist / tips / overlays). */
export function isTutorialChainUiComplete(flags: {
  beginnerStatus: BeginnerClaimsShape;
  celebrationAcknowledgedMerged: boolean;
}): boolean {
  if (isOnboardingTutorialDisabled()) return true;
  const claims = flags.beginnerStatus.claims.length;
  if (claims < BEGINNER_CHAIN_QUEST_IDS.length) return false;
  const serverSeen =
    typeof flags.beginnerStatus.beginnerChainCelebrationSeenAt === "string" &&
    flags.beginnerStatus.beginnerChainCelebrationSeenAt.length > 0;
  return serverSeen || flags.celebrationAcknowledgedMerged;
}

/** Overlay "New Player Protocol" — suppressed when server/local says returning user OR chain already progressed. */
export function shouldSkipStarterIntroOverlay(flags: {
  profile: ProfileTutorialFlagSnapshot | null | undefined;
  claimCountFromServer: number;
  lsIntroMarkedSeen: boolean;
}): boolean {
  if (isOnboardingTutorialDisabled()) return true;
  const p = flags.profile ?? {};
  if (flags.lsIntroMarkedSeen) return true;
  if (Boolean(p.onboarding_completed)) return true;
  const introSeenAt = typeof p.starter_intro_seen_at === "string" && p.starter_intro_seen_at.trim().length > 0;
  if (introSeenAt) return true;
  const chainDone =
    typeof p.beginner_chain_completed_at === "string" && p.beginner_chain_completed_at.trim().length > 0;
  if (chainDone) return true;
  const celeb =
    typeof p.beginner_chain_celebration_seen_at === "string" &&
    p.beginner_chain_celebration_seen_at.trim().length > 0;
  if (celeb) return true;
  if (flags.claimCountFromServer >= BEGINNER_CHAIN_QUEST_IDS.length) return true;
  return false;
}

export function logTutorialGating(reason: string, payload: Record<string, unknown>): void {
  if (process.env.NODE_ENV === "production") return;
  console.info("[cq] onboardingGate", {
    reason,
    ...payload,
  });
}
