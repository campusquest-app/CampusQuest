/**
 * Student reward pass rules shared by the API route and the client.
 * The pass is a live, short-lived display of verified student status for a cashier to look at.
 * It is not a payment, a receipt, or proof that a reward was redeemed.
 */

export const REWARD_PASS_TTL_SECONDS = 60;

export const REWARD_ERROR_CODES = {
  verificationRequired: "REWARD_STUDENT_VERIFICATION_REQUIRED",
  ineligible: "REWARD_INELIGIBLE_ACCOUNT",
  businessProfile: "REWARD_PERSONAL_PROFILE_REQUIRED",
  restricted: "REWARD_ACCOUNT_RESTRICTED",
  comingSoon: "REWARD_COMING_SOON",
  expired: "REWARD_EXPIRED",
  unavailable: "REWARD_TEMPORARILY_UNAVAILABLE",
  partnerNotFound: "PARTNER_NOT_FOUND",
} as const;

export type StudentRewardEligibilityInput = {
  /** `profiles.role`, read server-side. Only the exact value "student" is eligible. */
  role: string | null;
  studentStatus: string | null;
  campusEmailVerifiedAt: string | null;
  /** Auth email from the verified session, not from the request body. */
  email: string | null;
  pilotDomain: string | null;
  /** `user_active_identities.identity_type`; null means the personal profile. */
  activeIdentityType: string | null;
  accountStatus: string | null;
  suspendedUntil: string | null;
  now: Date;
};

export type StudentRewardEligibility =
  | { eligible: true }
  | { eligible: false; status: 403; code: string; message: string };

const NON_STUDENT_STATUSES = new Set(["faculty_staff", "not_student"]);

function emailDomain(email: string | null): string | null {
  if (!email) return null;
  const at = email.lastIndexOf("@");
  if (at <= 0 || at >= email.length - 1) return null;
  return email.slice(at + 1).trim().toLowerCase();
}

function isRestricted(status: string | null, suspendedUntil: string | null, now: Date): boolean {
  if (status === "banned") return true;
  if (status !== "suspended") return false;
  const until = suspendedUntil ? Date.parse(suspendedUntil) : NaN;
  return !Number.isFinite(until) || until > now.getTime();
}

export function evaluateStudentRewardEligibility(input: StudentRewardEligibilityInput): StudentRewardEligibility {
  if (isRestricted(input.accountStatus, input.suspendedUntil, input.now)) {
    return {
      eligible: false,
      status: 403,
      code: REWARD_ERROR_CODES.restricted,
      message: "Student rewards aren\u2019t available while your account is restricted.",
    };
  }
  if (input.role !== "student" || (input.studentStatus && NON_STUDENT_STATUSES.has(input.studentStatus))) {
    return {
      eligible: false,
      status: 403,
      code: REWARD_ERROR_CODES.ineligible,
      message: "Student rewards are only for verified URI student accounts.",
    };
  }
  if (input.activeIdentityType && input.activeIdentityType !== "personal") {
    return {
      eligible: false,
      status: 403,
      code: REWARD_ERROR_CODES.businessProfile,
      message: "Switch to your personal student profile to use student rewards.",
    };
  }
  const pilot = input.pilotDomain?.trim().toLowerCase().replace(/^@+/, "") || null;
  const domain = emailDomain(input.email);
  if (!input.campusEmailVerifiedAt || !domain || (pilot && domain !== pilot)) {
    return {
      eligible: false,
      status: 403,
      code: REWARD_ERROR_CODES.verificationRequired,
      message: "Verify your URI student email to unlock student rewards.",
    };
  }
  return { eligible: true };
}

export type StudentRewardPass = {
  passId: string;
  partnerId: string;
  partnerName: string;
  partnerLogoUrl: string | null;
  discountValue: string | null;
  offerTitle: string | null;
  offerDescription: string | null;
  rewardTerms: string | null;
  redemptionInstructions: string | null;
  verifiedLabel: string;
  studentName: string | null;
  issuedAt: string;
  expiresAt: string;
  /** Server clock at issue time so the countdown is not driven by a wrong device clock. */
  serverNow: string;
  /** App Review demo pass: watermarked, not valid for redemption, never logged. */
  demo?: boolean;
};

export type RewardPassResponse = { pass: StudentRewardPass };

export type RewardAccessIssue =
  | "coming_soon"
  | "expired"
  | "unavailable"
  | "login_required"
  | "verification_required"
  | "ineligible"
  | "offline"
  | "error";

/** Maps an API failure to the reward state shown to the student. */
export function rewardIssueFromError(error: { status?: number; code?: string } | null | undefined): RewardAccessIssue {
  const status = error?.status ?? 0;
  const code = error?.code ?? "";
  if (status === 401) return "login_required";
  switch (code) {
    case REWARD_ERROR_CODES.verificationRequired:
    case "SCHOOL_VERIFICATION_REQUIRED":
      return "verification_required";
    case REWARD_ERROR_CODES.ineligible:
    case REWARD_ERROR_CODES.businessProfile:
    case REWARD_ERROR_CODES.restricted:
      return "ineligible";
    case REWARD_ERROR_CODES.comingSoon:
      return "coming_soon";
    case REWARD_ERROR_CODES.expired:
      return "expired";
    case REWARD_ERROR_CODES.unavailable:
    case REWARD_ERROR_CODES.partnerNotFound:
      return "unavailable";
    default:
      return status === 0 ? "offline" : "error";
  }
}

export const REWARD_ISSUE_COPY: Record<RewardAccessIssue, { title: string; body: string }> = {
  coming_soon: { title: "Reward coming soon", body: "This business hasn\u2019t launched a student reward yet." },
  expired: { title: "Offer expired", body: "This student reward has ended." },
  unavailable: {
    title: "Temporarily unavailable",
    body: "This reward is paused right now. Check back soon.",
  },
  login_required: { title: "Sign in required", body: "Sign in to CampusQuest to view student rewards." },
  verification_required: {
    title: "Student verification required",
    body: "Verify your URI student email to unlock student rewards.",
  },
  ineligible: {
    title: "Not eligible",
    body: "Student rewards are only for verified URI student accounts.",
  },
  offline: {
    title: "You\u2019re offline",
    body: "Reconnect to show a live reward pass. Passes can\u2019t be shown offline.",
  },
  error: { title: "Something went wrong", body: "We couldn\u2019t load this reward. Try again in a moment." },
};

const BACKEND_DIAGNOSTIC = /backend request failed|\/api\/|returned \d{3}/i;

/**
 * Student-facing pass copy. Drops localhost "Backend request failed: /api/..."
 * prefixes so reviewers never see routes, status codes, or stack fragments.
 * Specific server sentences (e.g. switch to personal profile) are kept.
 */
export function sanitizeRewardPassIssueMessage(
  issue: RewardAccessIssue,
  message: string | null | undefined,
): string {
  const fallback = REWARD_ISSUE_COPY[issue].body;
  const trimmed = (message ?? "").trim();
  if (!trimmed) return fallback;
  const stripped = trimmed.replace(/^Backend request failed:[^.]*\.\s*/i, "").trim();
  if (!stripped || BACKEND_DIAGNOSTIC.test(stripped) || stripped.length > 180) return fallback;
  return stripped;
}

/** Seconds left on the pass, measured on the server clock. 0 means the pass must not be shown as valid. */
export function rewardPassSecondsLeft(pass: StudentRewardPass, clockOffsetMs: number, deviceNowMs: number): number {
  const expires = Date.parse(pass.expiresAt);
  if (!Number.isFinite(expires)) return 0;
  const serverNowMs = deviceNowMs + clockOffsetMs;
  return Math.max(0, Math.ceil((expires - serverNowMs) / 1000));
}
