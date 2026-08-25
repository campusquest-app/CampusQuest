import { ApiError } from "@/lib/server/http";
import { logEmailVerification } from "@/lib/authEmailDelivery";
import { CAMPUS_EMAIL_CODE_TTL_SECONDS } from "@/lib/campusEmailVerification";

const DEFAULT_FROM = "CampusQuest <noreply@campusquestapp.com>";

export function getResendApiKey(env: Record<string, string | undefined> = process.env): string {
  const key = (env.RESEND_API_KEY ?? "").trim();
  if (!key) {
    throw new ApiError(
      500,
      "We couldn't send your code. Please try again.",
      "EMAIL_VERIFICATION_RESEND_MISSING",
    );
  }
  return key;
}

export function getCampusVerificationFromAddress(
  env: Record<string, string | undefined> = process.env,
): string {
  const configured = (env.RESEND_FROM_EMAIL ?? env.EMAIL_VERIFICATION_FROM ?? "").trim();
  return configured || DEFAULT_FROM;
}

export function buildCampusVerificationEmailText(code: string): string {
  const minutes = Math.round(CAMPUS_EMAIL_CODE_TTL_SECONDS / 60);
  return [
    "CampusQuest",
    "",
    "Verify your URI email",
    "",
    "Your verification code is:",
    "",
    code,
    "",
    `This code expires in ${minutes} minutes.`,
    "",
    "If you didn't request this code, you can ignore this email.",
  ].join("\n");
}

export async function sendCampusVerificationEmailViaResend(args: {
  to: string;
  code: string;
  fetchImpl?: typeof fetch;
  env?: Record<string, string | undefined>;
}): Promise<void> {
  const env = args.env ?? process.env;
  const apiKey = getResendApiKey(env);
  const from = getCampusVerificationFromAddress(env);
  const fetchImpl = args.fetchImpl ?? fetch;

  const response = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [args.to],
      subject: "Your CampusQuest verification code",
      text: buildCampusVerificationEmailText(args.code),
    }),
  });

  if (!response.ok) {
    logEmailVerification("campus code email send failed", {
      status: response.status,
    });
    throw new ApiError(
      502,
      "We couldn't send your code. Please try again.",
      "EMAIL_VERIFICATION_SEND_FAILED",
    );
  }

  logEmailVerification("campus code email accepted", {});
}
