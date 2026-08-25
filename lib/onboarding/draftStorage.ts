import { isDemographicOnboardingStep, type DemographicOnboardingStep } from "@/lib/onboarding/flow";
import type { CommunityId, InterestId, StudentStatusId } from "@/lib/onboarding/taxonomy";
import { isKnownStudentStatus } from "@/lib/onboarding/taxonomy";

export const ONBOARDING_DRAFT_LEGACY_KEY = "cq_onboarding_v3_draft";
export const ONBOARDING_DRAFT_KEY_PREFIX = "cq_onboarding_v3_draft";

export type OnboardingDraftState = {
  userId?: string | null;
  step: DemographicOnboardingStep;
  studentStatus: StudentStatusId | null;
  graduationYear: number | null;
  graduateOther: boolean;
  institutionId: "uri";
  interests: InterestId[];
  communities: CommunityId[];
};

function draftKeyForUser(userId?: string | null): string {
  return userId ? `${ONBOARDING_DRAFT_KEY_PREFIX}:${userId}` : ONBOARDING_DRAFT_LEGACY_KEY;
}

function parseDraft(raw: string | null): Partial<OnboardingDraftState> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<OnboardingDraftState>;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function readOnboardingDraft(userId?: string | null): Partial<OnboardingDraftState> | null {
  if (typeof window === "undefined") return null;
  try {
    const keyed = parseDraft(sessionStorage.getItem(draftKeyForUser(userId)));
    if (keyed) {
      if (userId && keyed.userId && keyed.userId !== userId) return null;
      return keyed;
    }
    const legacy = parseDraft(sessionStorage.getItem(ONBOARDING_DRAFT_LEGACY_KEY));
    if (!legacy) return null;
    if (userId && legacy.userId !== userId) return null;
    return legacy;
  } catch {
    return null;
  }
}

export function writeOnboardingDraft(draft: OnboardingDraftState, userId?: string | null) {
  if (typeof window === "undefined") return;
  try {
    const payload: OnboardingDraftState = { ...draft, userId: userId ?? draft.userId ?? null };
    sessionStorage.setItem(draftKeyForUser(userId), JSON.stringify(payload));
    if (userId) sessionStorage.removeItem(ONBOARDING_DRAFT_LEGACY_KEY);
  } catch {
    /* ignore quota */
  }
}

export function clearOnboardingDraft(userId?: string | null) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(draftKeyForUser(userId));
    sessionStorage.removeItem(ONBOARDING_DRAFT_LEGACY_KEY);
  } catch {
    /* ignore */
  }
}

export function sanitizeDraftStep(value: unknown): DemographicOnboardingStep | null {
  return isDemographicOnboardingStep(value) ? value : null;
}

export function sanitizeDraftStudentStatus(value: unknown): StudentStatusId | null {
  return typeof value === "string" && isKnownStudentStatus(value) ? value : null;
}
