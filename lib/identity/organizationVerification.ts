/**
 * Organization / Greek Life verification request helpers (client + server safe).
 * Requests are stored in `verification_requests` (identity_type = "organization").
 */

export const ORG_VERIFICATION_VARIANTS = ["general", "greek"] as const;
export type OrgVerificationVariant = (typeof ORG_VERIFICATION_VARIANTS)[number];

export const GREEK_ORGANIZATION_TYPES = ["fraternity", "sorority"] as const;
export type GreekOrganizationType = (typeof GREEK_ORGANIZATION_TYPES)[number];

export const GREEK_ORGANIZATION_TYPE_LABELS: Record<GreekOrganizationType, string> = {
  fraternity: "Fraternity",
  sorority: "Sorority",
};

/** CampusQuest is URI-only; approval creates organizations under this school. */
export const ORG_VERIFICATION_CAMPUS = "University of Rhode Island";

export const ORG_VERIFICATION_AUTHORIZATION_COPY =
  "I confirm that I am authorized to request a CampusQuest page for this organization.";

export const ORG_ALREADY_VERIFIED_MESSAGE = "This organization already has a verified CampusQuest page.";
export const ORG_REQUEST_PENDING_MESSAGE = "A verification request for this organization is already under review.";

export const ORG_REQUEST_SUBMITTED_TITLE = "Verification request submitted";
export const ORG_REQUEST_SUBMITTED_BODY =
  "CampusQuest will review your request before the organization page is activated.";

export const ORG_VERIFICATION_CTA_COPY: Record<
  OrgVerificationVariant,
  { title: string; body: string; button: string }
> = {
  general: {
    title: "Register your organization",
    body: "Create a verified CampusQuest page for your club or student organization.",
    button: "Request Verification",
  },
  greek: {
    title: "Register your Greek organization",
    body: "Request a verified CampusQuest page for your fraternity or sorority.",
    button: "Request Verification",
  },
};

export type OrganizationAvailability = "available" | "pending" | "verified";

export function organizationAvailabilityMessage(status: OrganizationAvailability): string | null {
  if (status === "verified") return ORG_ALREADY_VERIFIED_MESSAGE;
  if (status === "pending") return ORG_REQUEST_PENDING_MESSAGE;
  return null;
}

export function isGreekOrganizationType(value: string | null | undefined): value is GreekOrganizationType {
  return Boolean(value && (GREEK_ORGANIZATION_TYPES as readonly string[]).includes(value));
}

/** Escapes `%`, `_` and `\` so a PostgREST `ilike` behaves as a case-insensitive exact match. */
export function escapeIlikeExact(value: string): string {
  return value.trim().replace(/[\\%_]/g, (match) => `\\${match}`);
}

const OPEN_REQUEST_STATUSES = new Set(["draft", "pending_review", "needs_info"]);

export function isOpenVerificationStatus(status: string | null | undefined): boolean {
  return Boolean(status && OPEN_REQUEST_STATUSES.has(status));
}

/** A member row grants page management (mirrors `identity_managers`). */
export function isOrganizationManagerRow(row: {
  org_role?: string | null;
  role?: string | null;
  status?: string | null;
}): boolean {
  if ((row.status ?? "approved") !== "approved") return false;
  return (
    ["owner", "admin"].includes(row.org_role ?? "") || ["manager", "owner", "admin"].includes(row.role ?? "")
  );
}

export function resolveOrganizationAvailability(args: {
  hasManagedOrganization: boolean;
  hasOpenRequest: boolean;
}): OrganizationAvailability {
  if (args.hasManagedOrganization) return "verified";
  if (args.hasOpenRequest) return "pending";
  return "available";
}

const REASON_COLUMN_MAX = 1000;
export const ORG_REQUEST_DETAILS_HEADER = "Request details";

/**
 * `verification_requests` has no columns for campus, Greek type, national
 * affiliation, or advisor contact yet, so they are stored as a labeled block in
 * `reason_for_access` (shown to admins). Keep within the 1000-char column limit.
 */
export function composeOrganizationRequestNotes(input: {
  reasonForAccess?: string | null;
  campus?: string | null;
  variant?: OrgVerificationVariant | null;
  greekType?: GreekOrganizationType | null;
  nationalAffiliation?: string | null;
  advisorName?: string | null;
  advisorEmail?: string | null;
}): string | null {
  const lines: string[] = [];
  const campus = input.campus?.trim();
  if (campus) lines.push(`Campus: ${campus}`);
  if (input.variant === "greek") {
    if (input.greekType) lines.push(`Greek organization: ${GREEK_ORGANIZATION_TYPE_LABELS[input.greekType]}`);
    const national = input.nationalAffiliation?.trim();
    if (national) lines.push(`National organization: ${national}`);
  }
  const advisorName = input.advisorName?.trim();
  const advisorEmail = input.advisorEmail?.trim();
  if (advisorName || advisorEmail) {
    const label = input.variant === "greek" ? "Chapter advisor" : "Advisor";
    lines.push(`${label}: ${[advisorName, advisorEmail ? `<${advisorEmail}>` : null].filter(Boolean).join(" ")}`);
  }

  const reason = input.reasonForAccess?.trim() ?? "";
  if (lines.length === 0) return reason ? reason.slice(0, REASON_COLUMN_MAX) : null;

  const details = `${ORG_REQUEST_DETAILS_HEADER}\n${lines.join("\n")}`;
  if (!reason) return details.slice(0, REASON_COLUMN_MAX);
  const room = REASON_COLUMN_MAX - details.length - 2;
  return room > 0 ? `${details}\n\n${reason.slice(0, room)}` : details.slice(0, REASON_COLUMN_MAX);
}
