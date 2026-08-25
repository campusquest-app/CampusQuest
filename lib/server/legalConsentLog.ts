/** Safe diagnostics for the legal agreement gate. Never log tokens, secrets, or headers. */

import { AGREEMENT_ERROR_CODES } from "@/lib/legal/agreementErrors";

export { AGREEMENT_ERROR_CODES };

export function isMissingRelationColumnError(error: { message?: string; code?: string } | null | undefined): boolean {
  if (!error) return false;
  const message = String(error.message ?? "").toLowerCase();
  const code = String(error.code ?? "").toLowerCase();
  if (code === "42703" || code === "pgrst204") return true;
  return (
    (message.includes("column") && (message.includes("does not exist") || message.includes("not found") || message.includes("schema cache"))) ||
    (message.includes("could not find") && message.includes("column"))
  );
}

export function logAgreementEvent(
  category: string,
  details: {
    path?: string;
    authenticated?: boolean;
    userId?: string | null;
    supabaseCode?: string | null;
    supabaseMessage?: string | null;
    extra?: Record<string, string | number | boolean | null>;
  },
): void {
  console.warn("[cq][legal-consent]", {
    category,
    path: details.path ?? null,
    authenticated: Boolean(details.authenticated),
    userId: details.userId ?? null,
    supabaseCode: details.supabaseCode ?? null,
    supabaseMessage: details.supabaseMessage ? String(details.supabaseMessage).slice(0, 280) : null,
    ...(details.extra ?? {}),
  });
}
