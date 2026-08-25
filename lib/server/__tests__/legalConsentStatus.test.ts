import { describe, expect, it } from "vitest";
import { AGREEMENT_ERROR_CODES, isMissingRelationColumnError } from "@/lib/server/legalConsentLog";
import {
  getLegalConsentStatus,
  mapConsentRowToStatus,
} from "@/lib/server/legalConsentStatus";
import { requireLegalConsentUser } from "@/lib/server/legalConsentAuth";

function createConsentClient(opts: {
  policyVersion?: string;
  policyError?: { message: string; code?: string } | null;
  onSelect?: (columns: string) => { data: Record<string, unknown> | null; error: { message: string; code?: string } | null };
  latest?: { policy_version?: string } | null;
}) {
  return {
    from(table: string) {
      if (table === "legal_policy_versions") {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: async () =>
                    opts.policyError
                      ? { data: null, error: opts.policyError }
                      : { data: { version: opts.policyVersion ?? "2026-08-11.1" }, error: null },
                }),
              }),
            }),
          }),
        };
      }
      return {
        select: (columns: string) => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () =>
                opts.onSelect?.(columns) ?? { data: null, error: null },
            }),
            order: () => ({
              limit: () => ({
                maybeSingle: async () => ({ data: opts.latest ?? null, error: null }),
              }),
            }),
          }),
        }),
      };
    },
  } as any;
}

describe("legal consent status", () => {
  it("treats a missing row as agreement required, not an auth failure", async () => {
    const status = await getLegalConsentStatus({
      userClient: createConsentClient({}),
      userId: "user-1",
    });
    expect(status.agreementComplete).toBe(false);
    expect(status.requiredReacceptance).toBe(true);
    expect(status.currentPolicyVersion).toBe("2026-08-11.1");
  });

  it("lets existing acceptances through without data consent", () => {
    const status = mapConsentRowToStatus({
      currentPolicyVersion: "2026-08-11.1",
      data: {
        policy_version: "2026-08-11.1",
        consented_at: "2026-08-11T00:00:00.000Z",
        accepted_terms: true,
        accepted_privacy: true,
        accepted_guidelines: true,
        accepted_data_consent: false,
      },
    });
    expect(status.agreementComplete).toBe(true);
    expect(status.acceptedDataConsent).toBe(false);
  });

  it("recovers when data-consent columns are missing from the schema", async () => {
    const status = await getLegalConsentStatus({
      userClient: createConsentClient({
        onSelect: (columns) => {
          if (columns.includes("accepted_data_consent")) {
            return {
              data: null,
              error: { message: "Could not find the 'accepted_data_consent' column of 'user_legal_consents' in the schema cache", code: "PGRST204" },
            };
          }
          return {
            data: {
              policy_version: "2026-08-11.1",
              consented_at: "2026-08-11T00:00:00.000Z",
              accepted_terms: true,
              accepted_privacy: true,
              accepted_guidelines: true,
            },
            error: null,
          };
        },
      }),
      userId: "qa-user",
    });
    expect(status.agreementComplete).toBe(true);
  });

  it("maps real status query failures to a retryable 503", async () => {
    await expect(
      getLegalConsentStatus({
        userClient: createConsentClient({
          onSelect: () => ({ data: null, error: { message: "connection reset", code: "57P01" } }),
        }),
        userId: "user-1",
      }),
    ).rejects.toMatchObject({
      status: 503,
      code: AGREEMENT_ERROR_CODES.STATUS_QUERY_FAILED,
    });
  });

  it("detects missing-column PostgREST errors", () => {
    expect(isMissingRelationColumnError({ code: "PGRST204", message: "column not in schema cache" })).toBe(true);
    expect(isMissingRelationColumnError({ code: "42703", message: "column does not exist" })).toBe(true);
    expect(isMissingRelationColumnError({ message: "jwt expired" })).toBe(false);
  });
});

describe("legal consent auth mapping", () => {
  it("maps a missing bearer token to AGREEMENT_AUTH_MISSING", async () => {
    await expect(requireLegalConsentUser(new Request("http://localhost/api/legal/consent/status"), "/api/legal/consent/status")).rejects.toMatchObject({
      status: 401,
      code: AGREEMENT_ERROR_CODES.AUTH_MISSING,
    });
  });
});
