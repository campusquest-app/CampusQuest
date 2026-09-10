import { sanitizeTechnicalDiagnostics } from "@/lib/eventSources/providerHealth";
import { getCampusVerificationFromAddress } from "@/lib/server/campusEmailVerificationMail";

export type ProductionAlertKind = "detected" | "resolved" | "failed_repair";

function alertRecipients(env: Record<string, string | undefined> = process.env): string[] {
  const dedicated = (env.CQ_PRODUCTION_ALERT_EMAIL ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return dedicated;
}

export function buildProductionAlertEmail(input: {
  kind: ProductionAlertKind;
  provider: string;
  errorCode: string;
  detectedAt: string;
  cause: string;
  repair?: string | null;
  verification?: string | null;
  inventoryBefore?: Record<string, unknown>;
  inventoryAfter?: Record<string, unknown>;
  commit?: string | null;
  reason?: string | null;
}): { subject: string; text: string } {
  const providerLabel = input.provider === "urinvolved" ? "URInvolved" : input.provider;
  if (input.kind === "resolved") {
    return {
      subject: `CampusQuest automatically recovered ${providerLabel}`,
      text: [
        `Provider: ${providerLabel}`,
        `Failure: ${input.errorCode}`,
        `Detected: ${input.detectedAt}`,
        "",
        "Cause:",
        sanitizeTechnicalDiagnostics(input.cause),
        "",
        "Repair:",
        input.repair ?? "Safe automatic repair completed.",
        "",
        "Verification:",
        input.verification ?? "Provider verification succeeded.",
        `Events before: ${String(input.inventoryBefore?.urinvolved ?? input.inventoryBefore?.events ?? "n/a")}`,
        `Events after: ${String(input.inventoryAfter?.urinvolved ?? input.inventoryAfter?.events ?? "n/a")}`,
        `Athletics events preserved: ${String(input.inventoryAfter?.athletics ?? input.inventoryBefore?.athletics ?? "n/a")}`,
        "",
        "Deployment:",
        `Commit: ${input.commit ?? "none (in-place schema/sync repair)"}`,
        "",
        "No action is required.",
      ].join("\n"),
    };
  }

  if (input.kind === "failed_repair") {
    return {
      subject: `CampusQuest could not automatically repair ${providerLabel}`,
      text: [
        `CampusQuest could not automatically repair ${providerLabel}.`,
        "",
        "Reason:",
        sanitizeTechnicalDiagnostics(input.reason ?? input.cause),
        "",
        "Existing event inventory was preserved.",
        "",
        "Manual review is required.",
      ].join("\n"),
    };
  }

  return {
    subject: `CampusQuest production incident: ${providerLabel}`,
    text: [
      `Provider: ${providerLabel}`,
      `Failure: ${input.errorCode}`,
      `Detected: ${input.detectedAt}`,
      "",
      sanitizeTechnicalDiagnostics(input.cause),
      "",
      "Existing event inventory was preserved.",
      "Manual review is required.",
    ].join("\n"),
  };
}

export async function sendProductionAlert(
  input: Parameters<typeof buildProductionAlertEmail>[0] & {
    fetchImpl?: typeof fetch;
    env?: Record<string, string | undefined>;
  },
): Promise<{ sent: boolean; reason?: string }> {
  const env = input.env ?? process.env;
  const recipients = alertRecipients(env);
  if (recipients.length === 0) {
    console.warn("[cq:provider-recovery]", {
      system: "provider-recovery",
      result: "alert_skipped",
      reason: "missing_CQ_PRODUCTION_ALERT_EMAIL",
    });
    return { sent: false, reason: "missing_recipients" };
  }
  const apiKey = (env.RESEND_API_KEY ?? "").trim();
  if (!apiKey) {
    console.warn("[cq:provider-recovery]", {
      system: "provider-recovery",
      result: "alert_skipped",
      reason: "missing_RESEND_API_KEY",
    });
    return { sent: false, reason: "missing_key" };
  }

  const { subject, text } = buildProductionAlertEmail(input);
  const fetchImpl = input.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: getCampusVerificationFromAddress(env),
        to: recipients,
        subject,
        text,
      }),
    });
    if (!response.ok) {
      console.warn("[cq:provider-recovery]", {
        system: "provider-recovery",
        result: "alert_failed",
        httpStatus: response.status,
      });
      return { sent: false, reason: "send_failed" };
    }
    return { sent: true };
  } catch {
    return { sent: false, reason: "network" };
  }
}
