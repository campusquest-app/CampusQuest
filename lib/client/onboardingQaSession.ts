import { isOnboardingQaEmail, logOnboardingQa } from "@/lib/onboardingQa";
import { readAccessTokenClaims } from "@/lib/client/jwtClaims";
import type { ProfileRouteInput } from "@/lib/client/appShellRoute";

export const ONBOARDING_QA_SESSION_STORAGE_KEY = "cq_onboarding_qa_session_v1";

export type OnboardingQaSessionPhase = "pending" | "completed";

export type OnboardingQaSessionRecord = {
  userId: string;
  sessionId: string;
  phase: OnboardingQaSessionPhase;
};

export type OnboardingQaDecision = {
  eligible: boolean;
  replay: boolean;
  activated: boolean;
  record: OnboardingQaSessionRecord | null;
};

function isRecord(value: unknown): value is OnboardingQaSessionRecord {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<OnboardingQaSessionRecord>;
  return (
    typeof row.userId === "string" &&
    row.userId.length > 0 &&
    typeof row.sessionId === "string" &&
    row.sessionId.length > 0 &&
    (row.phase === "pending" || row.phase === "completed")
  );
}

/**
 * Pure session-level replay decision.
 * New auth session → pending replay. Same session after completion → skip.
 */
export function decideOnboardingQaReplay(args: {
  email?: string | null;
  userId?: string | null;
  sessionId?: string | null;
  stored?: OnboardingQaSessionRecord | null;
}): OnboardingQaDecision {
  if (!isOnboardingQaEmail(args.email) || !args.userId || !args.sessionId) {
    return { eligible: false, replay: false, activated: false, record: null };
  }

  const stored = args.stored;
  if (stored && stored.userId === args.userId && stored.sessionId === args.sessionId) {
    return {
      eligible: true,
      replay: stored.phase === "pending",
      activated: false,
      record: stored,
    };
  }

  const record: OnboardingQaSessionRecord = {
    userId: args.userId,
    sessionId: args.sessionId,
    phase: "pending",
  };
  return { eligible: true, replay: true, activated: true, record };
}

export function markOnboardingQaRecordCompleted(
  record: OnboardingQaSessionRecord | null,
): OnboardingQaSessionRecord | null {
  if (!record) return null;
  return { ...record, phase: "completed" };
}

/** Routing overlay only — never persist these false flags to the database. */
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
    const parsed = JSON.parse(raw) as unknown;
    return isRecord(parsed) ? parsed : null;
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
    logOnboardingQa("replay activated for authorized QA account", {
      userId: decision.record?.userId ?? null,
    });
  }
  return decision;
}

export function completeOnboardingQaReplay(accessToken: string | null): void {
  const claims = readAccessTokenClaims(accessToken);
  const current = decideOnboardingQaReplay({
    email: claims?.email ?? null,
    userId: claims?.sub ?? null,
    sessionId: claims?.sessionId ?? null,
    stored: readStoredRecord(),
  });
  const completed = markOnboardingQaRecordCompleted(current.record);
  if (completed) {
    writeStoredRecord(completed);
    logOnboardingQa("replay completed for this login session", {
      userId: completed.userId,
    });
  }
}

export function clearOnboardingQaReplayStorage(): void {
  writeStoredRecord(null);
}
