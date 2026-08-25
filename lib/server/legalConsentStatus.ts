import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_POLICY_VERSION } from "@/lib/legal/policy";
import { ApiError } from "@/lib/server/http";
import {
  AGREEMENT_ERROR_CODES,
  isMissingRelationColumnError,
  logAgreementEvent,
} from "@/lib/server/legalConsentLog";

/**
 * Supabase `public.user_legal_consents` stores acceptance per policy version:
 * - accepted_terms, accepted_privacy (privacy policy), accepted_guidelines
 * - accepted_data_consent, data_consent_version, data_consented_at
 * - consented_at — timestamp when the row was recorded (policy acceptance time)
 *
 * App access still requires terms + privacy + guidelines only. Data consent is
 * recorded for new accepts and does not force existing users through re-consent.
 */

export const LEGAL_CONSENT_CORE_COLUMNS =
  "policy_version, consented_at, accepted_terms, accepted_privacy, accepted_guidelines";

export const LEGAL_CONSENT_DATA_COLUMNS =
  "accepted_data_consent, data_consent_version, data_consented_at";

export const LEGAL_CONSENT_SELECT_WITH_DATA = `${LEGAL_CONSENT_CORE_COLUMNS}, ${LEGAL_CONSENT_DATA_COLUMNS}`;

export type LegalConsentStatus = {
  acceptedCurrentVersion: boolean;
  agreementComplete: boolean;
  requiredReacceptance: boolean;
  currentPolicyVersion: string;
  latestAcceptedVersion: string | null;
  latestConsentedAt: string | null;
  acceptedTerms: boolean;
  acceptedPrivacyPolicy: boolean;
  acceptedGuidelines: boolean;
  acceptedDataConsent: boolean;
  dataConsentVersion: string | null;
  dataConsentedAt: string | null;
};

type ConsentRow = {
  policy_version?: string | null;
  consented_at?: string | null;
  accepted_terms?: boolean | null;
  accepted_privacy?: boolean | null;
  accepted_guidelines?: boolean | null;
  accepted_data_consent?: boolean | null;
  data_consent_version?: string | null;
  data_consented_at?: string | null;
};

export function mapConsentRowToStatus(args: {
  data: ConsentRow | null;
  currentPolicyVersion: string;
}): LegalConsentStatus {
  const { data, currentPolicyVersion } = args;
  const acceptedTerms = Boolean(data?.accepted_terms);
  const acceptedPrivacyPolicy = Boolean(data?.accepted_privacy);
  const acceptedGuidelines = Boolean(data?.accepted_guidelines);
  const acceptedDataConsent = Boolean(data?.accepted_data_consent);
  const agreementComplete = Boolean(data) && acceptedTerms && acceptedPrivacyPolicy && acceptedGuidelines;
  const latestAcceptedVersion = (data?.policy_version as string | null | undefined) ?? null;

  return {
    acceptedCurrentVersion: agreementComplete,
    agreementComplete,
    requiredReacceptance: !agreementComplete,
    currentPolicyVersion,
    latestAcceptedVersion,
    latestConsentedAt: (data?.consented_at as string | null | undefined) ?? null,
    acceptedTerms,
    acceptedPrivacyPolicy,
    acceptedGuidelines,
    acceptedDataConsent,
    dataConsentVersion: (data?.data_consent_version as string | null | undefined) ?? null,
    dataConsentedAt: (data?.data_consented_at as string | null | undefined) ?? null,
  };
}

async function selectConsentRow(
  userClient: SupabaseClient,
  userId: string,
  currentPolicyVersion: string,
  columns: string,
) {
  return userClient
    .from("user_legal_consents")
    .select(columns)
    .eq("user_id", userId)
    .eq("policy_version", currentPolicyVersion)
    .maybeSingle();
}

export async function getLegalConsentStatus(args: {
  userClient: SupabaseClient;
  userId: string;
  path?: string;
}): Promise<LegalConsentStatus> {
  const { userClient, userId } = args;
  const path = args.path ?? "/api/legal/consent/status";
  const currentPolicyVersion = await getActivePolicyVersion(userClient, path);

  let { data, error } = await selectConsentRow(userClient, userId, currentPolicyVersion, LEGAL_CONSENT_SELECT_WITH_DATA);

  if (error && isMissingRelationColumnError(error)) {
    logAgreementEvent(AGREEMENT_ERROR_CODES.STATUS_QUERY_FAILED, {
      path,
      authenticated: true,
      userId,
      supabaseCode: error.code ?? null,
      supabaseMessage: error.message,
      extra: { recovered: true, reason: "missing_data_consent_columns" },
    });
    const fallback = await selectConsentRow(userClient, userId, currentPolicyVersion, LEGAL_CONSENT_CORE_COLUMNS);
    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    logAgreementEvent(AGREEMENT_ERROR_CODES.STATUS_QUERY_FAILED, {
      path,
      authenticated: true,
      userId,
      supabaseCode: error.code ?? null,
      supabaseMessage: error.message,
    });
    throw new ApiError(
      503,
      "Could not verify your agreement status. Please try again.",
      AGREEMENT_ERROR_CODES.STATUS_QUERY_FAILED,
    );
  }

  const status = mapConsentRowToStatus({
    data: (data as ConsentRow | null) ?? null,
    currentPolicyVersion,
  });

  if (!status.agreementComplete && !data) {
    const { data: latest } = await userClient
      .from("user_legal_consents")
      .select("policy_version")
      .eq("user_id", userId)
      .order("consented_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const previousVersion = (latest?.policy_version as string | undefined) ?? null;
    if (previousVersion && previousVersion !== currentPolicyVersion) {
      logAgreementEvent(AGREEMENT_ERROR_CODES.VERSION_MISMATCH, {
        path,
        authenticated: true,
        userId,
        extra: { currentPolicyVersion, latestAcceptedVersion: previousVersion },
      });
    }
  }

  return status;
}

export async function getActivePolicyVersion(userClient: SupabaseClient, path = "/api/legal/consent/status") {
  const { data, error } = await userClient
    .from("legal_policy_versions")
    .select("version")
    .eq("is_active", true)
    .order("activated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    logAgreementEvent(AGREEMENT_ERROR_CODES.STATUS_QUERY_FAILED, {
      path,
      authenticated: true,
      supabaseCode: error.code ?? null,
      supabaseMessage: error.message,
      extra: { reason: "policy_version_fetch" },
    });
    throw new ApiError(
      503,
      "Could not verify your agreement status. Please try again.",
      AGREEMENT_ERROR_CODES.STATUS_QUERY_FAILED,
    );
  }

  return (data?.version as string | undefined) ?? DEFAULT_POLICY_VERSION;
}
