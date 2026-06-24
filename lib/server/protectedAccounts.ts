import { ApiError } from "@/lib/server/http";
import { isAdminEmail } from "@/lib/server/adminEmails";
import { type ProfileRole, roleAtLeast } from "@/lib/server/permissions";

/** Accounts that must never be deleted via admin tooling. */
export const PROTECTED_ACCOUNT_EMAILS = new Set(
  ["campusquest@campusquestapp.com", "nicklockhart22@uri.edu"].map((email) => email.toLowerCase()),
);

export function isProtectedAccountEmail(email: string | null | undefined): boolean {
  if (!email?.trim()) return false;
  return PROTECTED_ACCOUNT_EMAILS.has(email.trim().toLowerCase());
}

export function assertAdminCanDeleteTargetUser(args: {
  targetUserId: string;
  targetEmail: string | null;
  targetRole: ProfileRole;
}): void {
  if (isProtectedAccountEmail(args.targetEmail)) {
    throw new ApiError(403, "This account is protected and cannot be deleted.", "USER_DELETE_PROTECTED");
  }

  if (roleAtLeast(args.targetRole, "admin")) {
    throw new ApiError(403, "Admin accounts cannot be deleted from the dashboard.", "USER_DELETE_ADMIN_PROTECTED");
  }

  if (args.targetEmail && isAdminEmail(args.targetEmail)) {
    throw new ApiError(
      403,
      "Moderation admin accounts cannot be deleted from the dashboard.",
      "USER_DELETE_ADMIN_PROTECTED",
    );
  }
}
