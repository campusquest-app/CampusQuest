import { getCampusVerificationFromAddress } from "@/lib/server/campusEmailVerificationMail";
import { parseAdminVerificationEmails } from "@/lib/identity/policy";
import { getPublicSiteUrl, PRODUCTION_SITE_ORIGIN } from "@/lib/authRedirect";
import type { VerificationIdentityType } from "@/lib/identity/types";

export function getAdminVerificationEmails(
  env: Record<string, string | undefined> = process.env,
): string[] {
  return parseAdminVerificationEmails(env.ADMIN_VERIFICATION_EMAILS);
}

export function buildVerificationReviewUrl(requestId: string, env: Record<string, string | undefined> = process.env): string {
  let origin = PRODUCTION_SITE_ORIGIN;
  try {
    origin = getPublicSiteUrl(env);
  } catch {
    origin = PRODUCTION_SITE_ORIGIN;
  }
  return `${origin.replace(/\/+$/, "")}/internal/admin/verification/${requestId}`;
}

export function buildVerificationAdminEmailText(args: {
  applicantName: string;
  applicantEmail: string;
  identityType: VerificationIdentityType;
  requestedName: string;
  submittedAt: string;
  description: string;
  reviewUrl: string;
}): string {
  const typeLabel = args.identityType === "student_business" ? "Student Business" : "Organization";
  return [
    "CampusQuest",
    "",
    "A new verification request is ready for review.",
    "",
    `Applicant: ${args.applicantName}`,
    `Email: ${args.applicantEmail}`,
    `Type: ${typeLabel}`,
    `Requested name: ${args.requestedName}`,
    `Submitted: ${args.submittedAt}`,
    "",
    "Description:",
    args.description.trim().slice(0, 500) || "(none)",
    "",
    "Review Application:",
    args.reviewUrl,
  ].join("\n");
}

function recipientDomain(email: string): string {
  const at = email.lastIndexOf("@");
  return at >= 0 ? email.slice(at + 1).toLowerCase() : "unknown";
}

export async function notifyVerificationAdmins(args: {
  requestId: string;
  applicantName: string;
  applicantEmail: string;
  identityType: VerificationIdentityType;
  requestedName: string;
  submittedAt: string;
  description: string;
  fetchImpl?: typeof fetch;
  env?: Record<string, string | undefined>;
}): Promise<{ sent: boolean; reason?: string }> {
  const env = args.env ?? process.env;
  const recipients = getAdminVerificationEmails(env);
  if (recipients.length === 0) {
    console.warn("[verification-mail] skipped", {
      reason: "missing_recipients",
      requestId: args.requestId,
      ADMIN_VERIFICATION_EMAILS_configured: false,
    });
    return { sent: false, reason: "missing_recipients" };
  }

  const apiKey = (env.RESEND_API_KEY ?? "").trim();
  if (!apiKey) {
    console.warn("[verification-mail] skipped", {
      reason: "missing_key",
      requestId: args.requestId,
      recipientCount: recipients.length,
      RESEND_API_KEY_configured: false,
    });
    return { sent: false, reason: "missing_key" };
  }

  const from = getCampusVerificationFromAddress(env);
  const reviewUrl = buildVerificationReviewUrl(args.requestId, env);
  const text = buildVerificationAdminEmailText({ ...args, reviewUrl });
  const fetchImpl = args.fetchImpl ?? fetch;

  try {
    const response = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: recipients,
        subject: "New CampusQuest Verification Request",
        text,
      }),
    });
    if (!response.ok) {
      const raw = await response.text().catch(() => "");
      console.warn("[verification-mail] send failed", {
        requestId: args.requestId,
        httpStatus: response.status,
        recipientCount: recipients.length,
        recipientDomains: recipients.map(recipientDomain),
        from,
        bodyPreview: raw.slice(0, 180),
        RESEND_API_KEY_configured: true,
      });
      return { sent: false, reason: "send_failed" };
    }
    return { sent: true };
  } catch (error) {
    console.warn("[verification-mail] send failed", {
      requestId: args.requestId,
      reason: "network",
      errorName: error instanceof Error ? error.name : "unknown",
      RESEND_API_KEY_configured: true,
    });
    return { sent: false, reason: "network" };
  }
}
