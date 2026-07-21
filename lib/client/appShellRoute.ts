import { hasValidRoleSelection } from "@/lib/roles";

export type BootstrapStatus = "bootstrapping" | "unauthenticated" | "authenticated";

/** Resolved after profile fetch — never infer onboarding from a null character alone. */
export type ProfileRoute = "unknown" | "role_gate" | "character_gate" | "app";

export type AppShellRoute = "loading" | "hydrating" | "auth" | "role_selection" | "onboarding" | "app";

export type ProfileRouteInput = {
  onboarding_completed?: boolean | null;
  onboarding_character_completed?: boolean | null;
  role?: string | null;
  is_test_user?: boolean | null;
  qa_selected_role?: string | null;
};

export function isProfileSetupComplete(profile: ProfileRouteInput): boolean {
  return profile.onboarding_completed === true || profile.onboarding_character_completed === true;
}

/**
 * Account-type selection comes before everything else:
 * - new users hit it right after email verification (before character setup);
 * - existing users with a NULL/invalid role get the one-time prompt, then go
 *   straight back to the app (their onboarding stays complete);
 * - admins and internal testers never see it; QA re-tests it after each reset.
 */
export function resolveProfileRoute(profile: ProfileRouteInput): ProfileRoute {
  if (!hasValidRoleSelection(profile)) return "role_gate";
  return isProfileSetupComplete(profile) ? "app" : "character_gate";
}

export function resolveAppShellRoute(args: {
  bootstrapStatus: BootstrapStatus;
  profileRoute: ProfileRoute;
  showPostLoginLoading: boolean;
  hasCharacter: boolean;
}): AppShellRoute {
  if (args.showPostLoginLoading) return "loading";
  if (args.bootstrapStatus === "bootstrapping") return "hydrating";
  if (args.bootstrapStatus === "unauthenticated") return "auth";
  if (args.profileRoute === "unknown") return "hydrating";
  if (args.profileRoute === "role_gate") return "role_selection";
  if (args.profileRoute === "character_gate") return "onboarding";
  if (!args.hasCharacter) return "hydrating";
  return "app";
}
