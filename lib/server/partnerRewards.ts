import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { findPartnerById } from "@/lib/partners/partnerDirectory";
import { partnerRewardOfferState } from "@/lib/partners/partnerStatus";
import { REVIEW_DEMO_PARTNER } from "@/lib/partners/reviewDemoPartner";
import {
  evaluateStudentRewardEligibility,
  REWARD_ERROR_CODES,
  REWARD_PASS_TTL_SECONDS,
  type StudentRewardPass,
} from "@/lib/partners/rewardAccess";
import { ApiError } from "@/lib/server/http";
import { recordPartnerEngagement } from "@/lib/server/partnerEngagement";
import { getPilotSchoolConfig } from "@/lib/server/pilotMode";

type AdminLike = Pick<SupabaseClient, "from">;

const PASS_ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generatePassId(bytes: Buffer = randomBytes(6)): string {
  const chars = Array.from(bytes, (byte) => PASS_ID_ALPHABET[byte % PASS_ID_ALPHABET.length]).join("");
  return `${chars.slice(0, 3)}-${chars.slice(3, 6)}`;
}

/** "Nick Lockhart" -> "Nick L." so the cashier sees a name without the full profile. */
export function passDisplayName(displayName: string | null | undefined, username: string | null | undefined): string | null {
  const parts = (displayName ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return username?.trim() ? username.trim().slice(0, 30) : null;
  const first = parts[0].slice(0, 24);
  const lastInitial = parts.length > 1 ? ` ${parts[parts.length - 1][0].toUpperCase()}.` : "";
  return `${first}${lastInitial}`;
}

function verifiedLabel(): string {
  const pilot = getPilotSchoolConfig();
  if (pilot.schoolDomain === "uri.edu") return "Verified URI Student";
  return pilot.schoolName ? `Verified ${pilot.schoolName} Student` : "Verified Student";
}

function lookupFailed(): ApiError {
  return new ApiError(500, "We couldn\u2019t verify your student status right now.", "REWARD_VERIFICATION_FAILED");
}

/**
 * App Review demo pass for {@link REVIEW_DEMO_PARTNER}. Callers must first confirm the
 * session may view review demo content. Writes nothing: no engagement events and no
 * merchant liability.
 */
export function issueReviewDemoRewardPass(args: { now?: Date; passId?: string } = {}): StudentRewardPass {
  const now = args.now ?? new Date();
  const partner = REVIEW_DEMO_PARTNER;
  return {
    passId: args.passId ?? `DEMO-${generatePassId().slice(0, 3)}`,
    partnerId: partner.id,
    partnerName: partner.name,
    partnerLogoUrl: partner.logoUrl,
    discountValue: partner.discountValue,
    offerTitle: partner.offerTitle,
    offerDescription: partner.offerDescription,
    rewardTerms: partner.rewardTerms,
    redemptionInstructions: partner.redemptionInstructions,
    verifiedLabel: "Demo pass \u2014 not valid for redemption",
    studentName: null,
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + REWARD_PASS_TTL_SECONDS * 1000).toISOString(),
    serverNow: now.toISOString(),
    demo: true,
  };
}

/**
 * Issues a short-lived student reward pass after re-checking eligibility on the server.
 * Identity comes only from the authenticated session; role and verification are read from the database.
 * Called again for every refresh, so a pass stops renewing as soon as the account stops qualifying.
 */
export async function issueStudentRewardPass(args: {
  admin: AdminLike;
  user: { id: string; email?: string | null };
  partnerId: string;
  refresh?: boolean;
  now?: Date;
  passId?: string;
}): Promise<StudentRewardPass> {
  const now = args.now ?? new Date();
  const partner = findPartnerById(args.partnerId);
  if (!partner) throw new ApiError(404, "This business isn\u2019t a CampusQuest partner.", REWARD_ERROR_CODES.partnerNotFound);

  const offerState = partnerRewardOfferState(partner, now);
  if (offerState === "coming_soon") {
    throw new ApiError(409, "This business hasn\u2019t launched a student reward yet.", REWARD_ERROR_CODES.comingSoon);
  }
  if (offerState === "expired") {
    throw new ApiError(410, "This student reward has ended.", REWARD_ERROR_CODES.expired);
  }
  if (offerState === "unavailable") {
    throw new ApiError(409, "This reward is temporarily unavailable.", REWARD_ERROR_CODES.unavailable);
  }

  const [profileResult, identityResult, safetyResult] = await Promise.all([
    args.admin
      .from("profiles")
      .select("role, student_status, campus_email_verified_at, display_name, username")
      .eq("id", args.user.id)
      .maybeSingle(),
    args.admin.from("user_active_identities").select("identity_type").eq("user_id", args.user.id).maybeSingle(),
    args.admin.from("user_account_safety").select("status, suspended_until").eq("user_id", args.user.id).maybeSingle(),
  ]);
  if (profileResult.error || identityResult.error || safetyResult.error) throw lookupFailed();

  const profile = (profileResult.data ?? null) as Record<string, string | null> | null;
  const identity = (identityResult.data ?? null) as { identity_type?: string | null } | null;
  const safety = (safetyResult.data ?? null) as { status?: string | null; suspended_until?: string | null } | null;

  const eligibility = evaluateStudentRewardEligibility({
    role: profile?.role ?? null,
    studentStatus: profile?.student_status ?? null,
    campusEmailVerifiedAt: profile?.campus_email_verified_at ?? null,
    email: args.user.email ?? null,
    pilotDomain: getPilotSchoolConfig().schoolDomain,
    activeIdentityType: identity?.identity_type ?? null,
    accountStatus: safety?.status ?? null,
    suspendedUntil: safety?.suspended_until ?? null,
    now,
  });
  if (!eligibility.eligible) throw new ApiError(eligibility.status, eligibility.message, eligibility.code);

  if (!args.refresh) {
    await recordPartnerEngagement(args.admin, {
      userId: args.user.id,
      partnerId: partner.id,
      eventType: "reward_pass_authorized",
    });
  }

  return {
    passId: args.passId ?? generatePassId(),
    partnerId: partner.id,
    partnerName: partner.name,
    partnerLogoUrl: partner.logoUrl,
    discountValue: partner.discountValue,
    offerTitle: partner.offerTitle,
    offerDescription: partner.offerDescription,
    rewardTerms: partner.rewardTerms,
    redemptionInstructions: partner.redemptionInstructions,
    verifiedLabel: verifiedLabel(),
    studentName: passDisplayName(profile?.display_name, profile?.username),
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + REWARD_PASS_TTL_SECONDS * 1000).toISOString(),
    serverNow: now.toISOString(),
  };
}
