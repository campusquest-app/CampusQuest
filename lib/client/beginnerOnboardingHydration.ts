import { fetchAuthed } from "@/lib/client/dashboardApi";
import type { MeProfileRow } from "@/lib/client/profileCharacter";
import { syncCharacterProgressFromBackend } from "@/lib/store";
import {
  BEGINNER_CHAIN_QUEST_IDS,
  isTutorialChainUiComplete,
  logTutorialGating,
  shouldSkipStarterIntroOverlay,
} from "@/lib/client/onboardingTutorialGating";

export type BeginnerQuestClaimKey = "profile" | "activity" | "boss" | "leaderboard" | "guild";

export type BeginnerClaimStatusResponse = {
  claims: Array<{
    questKey: BeginnerQuestClaimKey;
    claimedAt: string;
    xpAwarded: number;
  }>;
  beginnerChainCompletedAt?: string | null;
  beginnerChainCelebrationSeenAt?: string | null;
};

type MeStatsResponse = {
  level?: number | null;
  total_xp?: number | null;
  strength?: number | null;
  stamina?: number | null;
  knowledge?: number | null;
  social?: number | null;
  focus?: number | null;
};

type MeProfileResponse = Pick<
  MeProfileRow,
  | "streak_days"
  | "last_activity_date"
  | "onboarding_completed"
  | "starter_intro_seen_at"
  | "beginner_chain_completed_at"
  | "beginner_chain_celebration_seen_at"
>;

export const CLAIMED_LS_PREFIX = `cq_beginner_quests_claimed_v1_`;
export const CELEBRATION_ACK_LS_PREFIX = `cq_beginner_chain_celebration_seen_v1_`;
/** localStorage keys — FirstTimeJourney + dev reset tooling. */
export const ONBOARDING_INTRO_LS_PREFIX = `cq_onboarding_intro_v1_`;

export function beginnerClaimedKey(characterId: string): string {
  return `${CLAIMED_LS_PREFIX}${characterId}`;
}

export function beginnerCelebrationAckKey(characterId: string): string {
  return `${CELEBRATION_ACK_LS_PREFIX}${characterId}`;
}

export function onboardingIntroLsKey(characterId: string): string {
  return `${ONBOARDING_INTRO_LS_PREFIX}${characterId}`;
}

export function readBeginnerCelebrationSeenLocal(characterId: string): boolean {
  try {
    return typeof window !== "undefined" && localStorage.getItem(beginnerCelebrationAckKey(characterId)) === "1";
  } catch {
    return false;
  }
}

function readOnboardingIntroSeenLocal(characterId: string): boolean {
  try {
    return typeof window !== "undefined" && localStorage.getItem(onboardingIntroLsKey(characterId)) === "1";
  } catch {
    return false;
  }
}

function canUseLocalFallback(): boolean {
  const isDev = process.env.NODE_ENV !== "production";
  const isOffline = typeof navigator !== "undefined" && navigator.onLine === false;
  return isDev || isOffline;
}

/** Hydration handed to FirstTimeJourney after parent fetch + LS merge (blocks mount until resolved). */
export type BeginnerOnboardingHydrationBootstrap = {
  beginnerStatus: BeginnerClaimStatusResponse;
  celebrationSeenFromServer: string | null | undefined;
  celebrationAcknowledged: boolean;
  /** From `/api/me/profile` snake_case parity with stored row subset. */
  onboarding_completed_flag: boolean;
  /** Equivalent: beginner-chain + celebration acknowledgment complete. */
  tutorial_completed_flag: boolean;
  /** Overlay "New Player Protocol" suppressed (computed before render). */
  skipStarterIntroOverlay: boolean;
  /** Omit FirstTimeJourney entirely (tutorial finished). */
  hideBeginnerStarterPanel: boolean;
  /** Show optional welcome-back community reminder (not first-time onboarding). */
  welcomeBackReminderEligible: boolean;
};

/**
 * Fetches onboarding status + merges celebration ack from LS. Syncs XP/streak into client store when API succeeds.
 */
export async function loadBeginnerOnboardingHydrationBundle(characterId: string): Promise<BeginnerOnboardingHydrationBootstrap> {
  let lsCelebrationSeen = readBeginnerCelebrationSeenLocal(characterId);
  try {
    const [status, stats, profile] = await Promise.all([
      fetchAuthed<BeginnerClaimStatusResponse>("/api/onboarding/beginner-quests/status"),
      fetchAuthed<MeStatsResponse>("/api/me/stats"),
      fetchAuthed<MeProfileResponse>("/api/me/profile"),
    ]);
    const nextClaimed: BeginnerQuestClaimKey[] = status.claims.map((c) => c.questKey);
    try {
      localStorage.setItem(beginnerClaimedKey(characterId), JSON.stringify(nextClaimed));
    } catch {
      // best effort only
    }
    syncCharacterProgressFromBackend(characterId, {
      stats: {
        level: stats.level ?? null,
        total_xp: stats.total_xp ?? null,
        strength: stats.strength ?? null,
        stamina: stats.stamina ?? null,
        knowledge: stats.knowledge ?? null,
        social: stats.social ?? null,
        focus: stats.focus ?? null,
      },
      profile: {
        streak_days: profile.streak_days ?? null,
        last_activity_date: profile.last_activity_date ?? null,
      },
    });

    lsCelebrationSeen = readBeginnerCelebrationSeenLocal(characterId);
    const serverSeenAt = status.beginnerChainCelebrationSeenAt ?? profile.beginner_chain_celebration_seen_at ?? null;
    const celebrationSeenFromServer: string | null = serverSeenAt;
    const celebrationAcknowledgedMerged = Boolean(serverSeenAt) || lsCelebrationSeen;

    const profileFlagsForIntro: Partial<Pick<
      MeProfileRow,
      | "onboarding_completed"
      | "starter_intro_seen_at"
      | "beginner_chain_completed_at"
      | "beginner_chain_celebration_seen_at"
    >> = {
      onboarding_completed: profile.onboarding_completed ?? null,
      starter_intro_seen_at: profile.starter_intro_seen_at ?? null,
      beginner_chain_completed_at:
        profile.beginner_chain_completed_at ?? status.beginnerChainCompletedAt ?? null,
      beginner_chain_celebration_seen_at:
        profile.beginner_chain_celebration_seen_at ?? status.beginnerChainCelebrationSeenAt ?? null,
    };

    const skipStarterIntroOverlay = shouldSkipStarterIntroOverlay({
      profile: profileFlagsForIntro,
      claimCountFromServer: status.claims.length,
      lsIntroMarkedSeen: readOnboardingIntroSeenLocal(characterId),
    });

    const hideBeginnerStarterPanel = isTutorialChainUiComplete({
      beginnerStatus: {
        claims: status.claims,
        beginnerChainCelebrationSeenAt: celebrationSeenFromServer ?? undefined,
        beginnerChainCompletedAt: status.beginnerChainCompletedAt ?? profile.beginner_chain_completed_at ?? null,
      },
      celebrationAcknowledgedMerged,
    });

    const onboarding_completed_flag = Boolean(profile.onboarding_completed);
    const tutorial_completed_flag = hideBeginnerStarterPanel;

    const hasReturningProfileSignals =
      onboarding_completed_flag ||
      Boolean(typeof profile.starter_intro_seen_at === "string" && profile.starter_intro_seen_at.trim().length > 0) ||
      Boolean(
        typeof profile.beginner_chain_celebration_seen_at === "string" &&
          profile.beginner_chain_celebration_seen_at.trim().length > 0,
      ) ||
      Boolean(
        typeof profile.beginner_chain_completed_at === "string" && profile.beginner_chain_completed_at.trim().length > 0,
      );

    const welcomeBackReminderEligible = hideBeginnerStarterPanel && hasReturningProfileSignals;
    logTutorialGating("bundleLoadedOk", {
      onboarding_completed_flag,
      tutorial_completed_flag,
      skipStarterIntroOverlay,
      hideBeginnerStarterPanel,
      welcomeBackReminderEligible,
      claimCount: status.claims.length,
      lsIntroMarkedSeen: readOnboardingIntroSeenLocal(characterId),
    });

    return {
      beginnerStatus: status,
      celebrationSeenFromServer,
      celebrationAcknowledged: celebrationAcknowledgedMerged,
      onboarding_completed_flag,
      tutorial_completed_flag,
      skipStarterIntroOverlay,
      hideBeginnerStarterPanel,
      welcomeBackReminderEligible,
    };
  } catch {
    lsCelebrationSeen = readBeginnerCelebrationSeenLocal(characterId);
    if (!canUseLocalFallback()) {
      const onboarding_completed_flag = false;
      const tutorial_completed_flag = false;
      const skipStarterIntroOverlay = shouldSkipStarterIntroOverlay({
        profile: {},
        claimCountFromServer: 0,
        lsIntroMarkedSeen: readOnboardingIntroSeenLocal(characterId),
      });
      logTutorialGating("bundleFetchFailedMinimal", {
        onboarding_completed_flag,
        tutorial_completed_flag,
        skipStarterIntroOverlay,
        hideBeginnerStarterPanel: false,
        welcomeBackReminderEligible: false,
      });
      return {
        beginnerStatus: { claims: [] },
        celebrationSeenFromServer: undefined,
        celebrationAcknowledged: lsCelebrationSeen,
        onboarding_completed_flag,
        tutorial_completed_flag,
        skipStarterIntroOverlay,
        hideBeginnerStarterPanel: false,
        welcomeBackReminderEligible: false,
      };
    }
    let claimsParsed: BeginnerQuestClaimKey[] = [];
    try {
      const rawClaimed = localStorage.getItem(beginnerClaimedKey(characterId));
      if (rawClaimed) claimsParsed = JSON.parse(rawClaimed) as BeginnerQuestClaimKey[];
    } catch {
      // ignore
    }
    const status: BeginnerClaimStatusResponse = {
      claims: claimsParsed.map((questKey) => ({
        questKey,
        claimedAt: new Date().toISOString(),
        xpAwarded: 0,
      })),
    };
    const celebrationAcknowledgedMerged = lsCelebrationSeen;
    const skipStarterIntroOverlay = shouldSkipStarterIntroOverlay({
      profile: {},
      claimCountFromServer: claimsParsed.length,
      lsIntroMarkedSeen: readOnboardingIntroSeenLocal(characterId),
    });
    const hideBeginnerStarterPanel = isTutorialChainUiComplete({
      beginnerStatus: { claims: status.claims, beginnerChainCelebrationSeenAt: null },
      celebrationAcknowledgedMerged,
    });

    logTutorialGating("bundleLocalFallbackDev", {
      onboarding_completed_flag: false,
      tutorial_completed_flag: hideBeginnerStarterPanel,
      skipStarterIntroOverlay,
      hideBeginnerStarterPanel,
      welcomeBackReminderEligible:
        hideBeginnerStarterPanel &&
        claimsParsed.length >= BEGINNER_CHAIN_QUEST_IDS.length &&
        (lsCelebrationSeen || readOnboardingIntroSeenLocal(characterId)),
      claimCount: claimsParsed.length,
      lsIntroMarkedSeen: readOnboardingIntroSeenLocal(characterId),
    });

    return {
      beginnerStatus: status,
      celebrationSeenFromServer: null,
      celebrationAcknowledged: lsCelebrationSeen,
      onboarding_completed_flag: false,
      tutorial_completed_flag: hideBeginnerStarterPanel,
      skipStarterIntroOverlay,
      hideBeginnerStarterPanel,
      welcomeBackReminderEligible:
        hideBeginnerStarterPanel &&
        claimsParsed.length >= BEGINNER_CHAIN_QUEST_IDS.length &&
        (lsCelebrationSeen || readOnboardingIntroSeenLocal(characterId)),
    };
  }
}
