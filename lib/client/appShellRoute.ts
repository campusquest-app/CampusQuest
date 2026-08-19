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
 * Account-type + character setup routing:
 * - New users without a role go straight to character onboarding (role is picked there).
 * - Existing users who finished character setup but lack a role get the standalone role gate.
 * - Admins / internal testers never see the role gate.
 */
export function resolveProfileRoute(profile: ProfileRouteInput): ProfileRoute {
  const setupComplete = isProfileSetupComplete(profile);
  if (!hasValidRoleSelection(profile)) {
    return setupComplete ? "role_gate" : "character_gate";
  }
  return setupComplete ? "app" : "character_gate";
}

/** True when bootstrap can safely choose auth / setup / app — independent of splash UI. */
export function isAppShellDecisionReady(args: {
  bootstrapStatus: BootstrapStatus;
  profileRoute: ProfileRoute;
  hasCharacter: boolean;
}): boolean {
  if (args.bootstrapStatus === "bootstrapping") return false;
  if (args.bootstrapStatus === "unauthenticated") return true;
  if (args.profileRoute === "unknown") return false;
  if (args.profileRoute === "app" && !args.hasCharacter) return false;
  return true;
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
