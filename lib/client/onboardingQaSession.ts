import { clearOnboardingDraft } from "@/lib/onboarding/draftStorage";
import { isOnboardingQaEmail, logOnboardingQa } from "@/lib/onboardingQa";
import { readAccessTokenClaims } from "@/lib/client/jwtClaims";
import type { ProfileRouteInput } from "@/lib/client/appShellRoute";

export const ONBOARDING_QA_SESSION_STORAGE_KEY = "cq_onboarding_qa_session_v1";

export type OnboardingQaPhase = "pending" | "completed";

export type OnboardingQaSessionRecord = {
  userId: string;
  sessionId: string;
  /** @deprecated Legacy single-phase field — migrated to demographics/character phases. */
  phase?: OnboardingQaPhase;
  demographicsPhase: OnboardingQaPhase;
  characterPhase: OnboardingQaPhase;
};

export type OnboardingQaDecision = {
  eligible: boolean;
  /** Force CharacterGate replay for this login session. */
  replay: boolean;
  /** Force demographic onboarding for this login session. */
  demographicsReplay: boolean;
  activated: boolean;
  record: OnboardingQaSessionRecord | null;
};

function normalizeRecord(value: unknown): OnboardingQaSessionRecord | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<OnboardingQaSessionRecord> & { phase?: OnboardingQaPhase };
  if (typeof row.userId !== "string" || !row.userId) return null;
  if (typeof row.sessionId !== "string" || !row.sessionId) return null;

  // Migrate legacy { phase } records.
  if (row.demographicsPhase !== "pending" && row.demographicsPhase !== "completed") {
    const legacy = row.phase === "completed" ? "completed" : "pending";
    return {
      userId: row.userId,
      sessionId: row.sessionId,
      demographicsPhase: legacy,
      characterPhase: legacy,
    };
  }
  if (row.characterPhase !== "pending" && row.characterPhase !== "completed") {
    return {
      userId: row.userId,
      sessionId: row.sessionId,
      demographicsPhase: row.demographicsPhase,
      characterPhase: row.demographicsPhase,
    };
  }
  return {
    userId: row.userId,
    sessionId: row.sessionId,
    demographicsPhase: row.demographicsPhase,
    characterPhase: row.characterPhase,
  };
}

/**
 * Pure session-level replay decision for the dedicated onboarding QA account.
 * New auth session → both demographics + character pending.
 * Completing each gate advances that phase only.
 */
export function decideOnboardingQaReplay(args: {
  email?: string | null;
  userId?: string | null;
  sessionId?: string | null;
  stored?: OnboardingQaSessionRecord | null;
}): OnboardingQaDecision {
  if (!isOnboardingQaEmail(args.email) || !args.userId || !args.sessionId) {
    return {
      eligible: false,
      replay: false,
      demographicsReplay: false,
      activated: false,
      record: null,
    };
  }

  const stored = args.stored ? normalizeRecord(args.stored) : null;
  if (stored && stored.userId === args.userId && stored.sessionId === args.sessionId) {
    return {
      eligible: true,
      demographicsReplay: stored.demographicsPhase === "pending",
      replay: stored.characterPhase === "pending",
      activated: false,
      record: stored,
    };
  }

  const record: OnboardingQaSessionRecord = {
    userId: args.userId,
    sessionId: args.sessionId,
    demographicsPhase: "pending",
    characterPhase: "pending",
  };
  return {
    eligible: true,
    demographicsReplay: true,
    replay: true,
    activated: true,
    record,
  };
}

export function markOnboardingQaRecordCompleted(
  record: OnboardingQaSessionRecord | null,
): OnboardingQaSessionRecord | null {
  if (!record) return null;
  return {
    ...record,
    demographicsPhase: "completed",
    characterPhase: "completed",
    phase: "completed",
  };
}

export function markDemographicQaReplayCompleted(
  record: OnboardingQaSessionRecord | null,
): OnboardingQaSessionRecord | null {
  if (!record) return null;
  return {
    ...record,
    demographicsPhase: "completed",
  };
}

export function markCharacterQaReplayCompleted(
  record: OnboardingQaSessionRecord | null,
): OnboardingQaSessionRecord | null {
  if (!record) return null;
  return {
    ...record,
    characterPhase: "completed",
    demographicsPhase: "completed",
    phase: "completed",
  };
}

/** @deprecated Prefer force flags via decideOnboardingQaReplay — kept for older call sites. */
export function applyOnboardingQaReplayOverride(
  profile: ProfileRouteInput,
  replay: boolean,
): ProfileRouteInput {
  if (!replay) return profile;
  return {
    ...profile,
    onboarding_completed: false,
    onboarding_character_completed: false,
  };
}

function readStoredRecord(): OnboardingQaSessionRecord | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(ONBOARDING_QA_SESSION_STORAGE_KEY);
    if (!raw) return null;
    return normalizeRecord(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

function writeStoredRecord(record: OnboardingQaSessionRecord | null): void {
  if (typeof window === "undefined") return;
  try {
    if (!record) {
      localStorage.removeItem(ONBOARDING_QA_SESSION_STORAGE_KEY);
      return;
    }
    localStorage.setItem(ONBOARDING_QA_SESSION_STORAGE_KEY, JSON.stringify(record));
  } catch {
    // Private mode / quota — replay still works for this JS lifetime via return value.
  }
}

export function syncOnboardingQaReplayFromAccessToken(accessToken: string | null): OnboardingQaDecision {
  const claims = readAccessTokenClaims(accessToken);
  const decision = decideOnboardingQaReplay({
    email: claims?.email ?? null,
    userId: claims?.sub ?? null,
    sessionId: claims?.sessionId ?? null,
    stored: readStoredRecord(),
  });
  if (decision.record) writeStoredRecord(decision.record);
  if (decision.activated) {
    clearOnboardingDraft(decision.record?.userId ?? claims?.sub ?? null);
    logOnboardingQa("replay activated for authorized QA account", {
      userId: decision.record?.userId ?? null,
      demographicsReplay: decision.demographicsReplay,
      characterReplay: decision.replay,
    });
  }
  return decision;
}

export function completeDemographicQaReplay(accessToken: string | null): void {
  const claims = readAccessTokenClaims(accessToken);
  const current = decideOnboardingQaReplay({
    email: claims?.email ?? null,
    userId: claims?.sub ?? null,
    sessionId: claims?.sessionId ?? null,
    stored: readStoredRecord(),
  });
  const next = markDemographicQaReplayCompleted(current.record);
  if (next) {
    writeStoredRecord(next);
    logOnboardingQa("demographic replay completed for this login session", {
      userId: next.userId,
    });
  }
}

export function completeOnboardingQaReplay(accessToken: string | null): void {
  const claims = readAccessTokenClaims(accessToken);
  const current = decideOnboardingQaReplay({
    email: claims?.email ?? null,
    userId: claims?.sub ?? null,
    sessionId: claims?.sessionId ?? null,
    stored: readStoredRecord(),
  });
  const completed = markCharacterQaReplayCompleted(current.record);
  if (completed) {
    writeStoredRecord(completed);
    logOnboardingQa("character replay completed for this login session", {
      userId: completed.userId,
    });
  }
}

export function clearOnboardingQaReplayStorage(): void {
  writeStoredRecord(null);
}
