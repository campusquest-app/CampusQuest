/**
 * Platform admin identity helpers — safe for client and server.
 * Email fallbacks are dev/local safety nets; production should use profiles.role or MODERATION_ADMIN_EMAILS.
 */

export function normalizeEmail(email?: string | null): string {
  return email?.trim().toLowerCase() ?? "";
}

export const ADMIN_EMAIL_FALLBACKS = new Set<string>([
  "campusquest@campusquestapp.com",
  "nicklockhart22@gmail.com",
  "nicklockhart22@uri.edu",
]);

export function isAdminEmailFallback(email?: string | null): boolean {
  return ADMIN_EMAIL_FALLBACKS.has(normalizeEmail(email));
}

export function extractEmailDomain(email?: string | null): string | null {
  const normalized = normalizeEmail(email);
  const atIndex = normalized.lastIndexOf("@");
  if (atIndex <= 0 || atIndex >= normalized.length - 1) return null;
  return normalized.slice(atIndex + 1);
}
