import { FEATURE_FLAGS } from "@/lib/featureFlags";

export function hasConfirmedEmail(user: {
  email_confirmed_at?: string | null;
  confirmed_at?: string | null;
}): boolean {
  return Boolean(user.email_confirmed_at ?? user.confirmed_at);
}

/**
 * Unverified users cannot enter the authenticated app when confirmation is required.
 * Does not fake verification — a missing confirmed_at is a hard block.
 */
export function canEnterAuthenticatedApp(args: {
  emailConfirmed: boolean;
  requireEmailVerification?: boolean;
}): boolean {
  const required = args.requireEmailVerification ?? FEATURE_FLAGS.requireEmailVerification;
  if (!required) return true;
  return args.emailConfirmed;
}
