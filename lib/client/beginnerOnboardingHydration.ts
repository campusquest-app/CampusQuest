import { fetchAuthed } from "@/lib/client/dashboardApi";
import { syncCharacterProgressFromBackend } from "@/lib/store";

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

type MeProfileResponse = {
  streak_days?: number | null;
  last_activity_date?: string | null;
};

export const CLAIMED_LS_PREFIX = `cq_beginner_quests_claimed_v1_`;
export const CELEBRATION_ACK_LS_PREFIX = `cq_beginner_chain_celebration_seen_v1_`;

/** localStorage keys — keep in sync with FirstTimeJourney. */
export function beginnerClaimedKey(characterId: string): string {
  return `${CLAIMED_LS_PREFIX}${characterId}`;
}

export function beginnerCelebrationAckKey(characterId: string): string {
  return `${CELEBRATION_ACK_LS_PREFIX}${characterId}`;
}

export function readBeginnerCelebrationSeenLocal(characterId: string): boolean {
  try {
    return typeof window !== "undefined" && localStorage.getItem(beginnerCelebrationAckKey(characterId)) === "1";
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
    const serverSeenAt = status.beginnerChainCelebrationSeenAt ?? null;
    const serverSeen = Boolean(serverSeenAt);
    const celebrationSeenFromServer: string | null = serverSeenAt;
    const celebrationAcknowledged = serverSeen || lsCelebrationSeen;

    return {
      beginnerStatus: status,
      celebrationSeenFromServer,
      celebrationAcknowledged,
    };
  } catch {
    lsCelebrationSeen = readBeginnerCelebrationSeenLocal(characterId);
    if (!canUseLocalFallback()) {
      return {
        beginnerStatus: { claims: [] },
        celebrationSeenFromServer: undefined,
        celebrationAcknowledged: lsCelebrationSeen,
      };
    }
    let claimsParsed: BeginnerQuestClaimKey[] = [];
    try {
      const rawClaimed = localStorage.getItem(beginnerClaimedKey(characterId));
      if (rawClaimed) claimsParsed = JSON.parse(rawClaimed) as BeginnerQuestClaimKey[];
    } catch {
      // ignore
    }
    return {
      beginnerStatus: {
        claims: claimsParsed.map((questKey) => ({
          questKey,
          claimedAt: new Date().toISOString(),
          xpAwarded: 0,
        })),
      },
      celebrationSeenFromServer: null,
      celebrationAcknowledged: lsCelebrationSeen,
    };
  }
}
