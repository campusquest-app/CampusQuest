"use client";

import { BadgeCheck, Clock } from "lucide-react";
import { openVerificationOnboarding } from "@/lib/client/identityStore";
import { useCampusIdentities } from "@/lib/client/useCampusIdentities";
import { ORG_VERIFICATION_CTA_COPY, type OrgVerificationVariant } from "@/lib/identity/organizationVerification";
import type { VerificationRequestSummary } from "@/lib/identity/types";

export function pendingOrgRequestsForVariant(
  requests: VerificationRequestSummary[],
  variant: OrgVerificationVariant,
): VerificationRequestSummary[] {
  return requests.filter(
    (request) =>
      request.identityType === "organization" &&
      (request.status === "pending_review" || request.status === "needs_info") &&
      (variant === "greek") === (request.category === "greek_life"),
  );
}

export function OrgVerificationCtaView({
  variant,
  pending,
  onRequest,
}: {
  variant: OrgVerificationVariant;
  pending: VerificationRequestSummary[];
  onRequest: () => void;
}) {
  const copy = ORG_VERIFICATION_CTA_COPY[variant];
  const headingId = `cq-org-cta-${variant}`;
  return (
    <section className="cq-org-cta" aria-labelledby={headingId}>
      <span className="cq-org-cta__icon" aria-hidden>
        <BadgeCheck className="h-5 w-5" />
      </span>
      <div className="cq-org-cta__text">
        <h2 id={headingId} className="cq-org-cta__title">
          {copy.title}
        </h2>
        <p className="cq-org-cta__body">{copy.body}</p>
        {pending.length > 0 ? (
          <p className="cq-org-cta__pending">
            <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>
              {pending.length === 1 ? `${pending[0].name}: ` : `${pending.length} requests: `}
              {pending.some((request) => request.status === "needs_info") ? "more information needed" : "under review"}
            </span>
          </p>
        ) : null}
      </div>
      <button type="button" className="cq-org-cta__btn" onClick={onRequest}>
        {copy.button}
      </button>
    </section>
  );
}

export function OrgVerificationCta({ variant }: { variant: OrgVerificationVariant }) {
  const { pendingRequests } = useCampusIdentities();
  return (
    <OrgVerificationCtaView
      variant={variant}
      pending={pendingOrgRequestsForVariant(pendingRequests, variant)}
      onRequest={() => openVerificationOnboarding("organization", variant)}
    />
  );
}
