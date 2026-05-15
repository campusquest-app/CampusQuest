import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_POLICY_VERSION } from "@/lib/legal/policy";
import { ApiError } from "@/lib/server/http";

/**
 * Supabase `public.user_legal_consents` stores acceptance per policy version:
 * - accepted_terms, accepted_privacy (privacy policy), accepted_guidelines
 * - consented_at — timestamp when the row was recorded (policy acceptance time)
 */

export async function getLegalConsentStatus(args: { userClient: SupabaseClient; userId: string }) {
  const { userClient, userId } = args;
  const currentPolicyVersion = await getActivePolicyVersion(userClient);

  const { data, error } = await userClient
    .from("user_legal_consents")
    .select("policy_version, consented_at, accepted_terms, accepted_privacy, accepted_guidelines")
    .eq("user_id", userId)
    .eq("policy_version", currentPolicyVersion)
    .maybeSingle();

  if (error) {
    throw new ApiError(400, error.message, "LEGAL_CONSENT_STATUS_FAILED");
  }

  const acceptedTerms = Boolean(data?.accepted_terms);
  /** DB column `accepted_privacy` — privacy policy acceptance */
  const acceptedPrivacyPolicy = Boolean(data?.accepted_privacy);
  const acceptedGuidelines = Boolean(data?.accepted_guidelines);

  const agreementComplete = Boolean(data) && acceptedTerms && acceptedPrivacyPolicy && acceptedGuidelines;

  return {
    /** @deprecated use agreementComplete — kept for older clients */
    acceptedCurrentVersion: agreementComplete,
    agreementComplete,
    requiredReacceptance: !agreementComplete,
    currentPolicyVersion,
    latestAcceptedVersion: data?.policy_version ?? null,
    latestConsentedAt: data?.consented_at ?? null,
    acceptedTerms,
    acceptedPrivacyPolicy,
    acceptedGuidelines,
  };
}

export async function getActivePolicyVersion(userClient: SupabaseClient) {
  const { data, error } = await userClient
    .from("legal_policy_versions")
    .select("version")
    .eq("is_active", true)
    .order("activated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new ApiError(400, error.message, "LEGAL_POLICY_VERSION_FETCH_FAILED");
  }

  return (data?.version as string | undefined) ?? DEFAULT_POLICY_VERSION;
}
