/** Moderation allow-list emails (env `MODERATION_ADMIN_EMAILS`) — no imports from permissions/adminAuth. */

import { FEATURE_FLAGS } from "@/lib/featureFlags";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function listAdminEmails() {
  return (process.env.MODERATION_ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => normalizeEmail(email))
    .filter(Boolean);
}

export function isAdminEmail(email: string): boolean {
  return listAdminEmails().includes(normalizeEmail(email));
}

export function isAuthEmailConfirmed(user: { email_confirmed_at?: string | null; confirmed_at?: string | null }) {
  if (!FEATURE_FLAGS.requireEmailVerification) return true;
  return Boolean(user.email_confirmed_at ?? user.confirmed_at);
}

export function userHasModerationAdminAccess(user: {
  email?: string | null;
  email_confirmed_at?: string | null;
  confirmed_at?: string | null;
}): boolean {
  const email = user.email?.trim();
  if (!email) return false;
  if (!isAuthEmailConfirmed(user)) return false;
  return isAdminEmail(email);
}
