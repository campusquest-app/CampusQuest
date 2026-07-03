export type BootstrapStatus = "bootstrapping" | "unauthenticated" | "authenticated";

/** Resolved after profile fetch — never infer onboarding from a null character alone. */
export type ProfileRoute = "unknown" | "character_gate" | "app";

export type AppShellRoute = "loading" | "hydrating" | "auth" | "onboarding" | "app";

export function isProfileSetupComplete(profile: {
  onboarding_completed?: boolean | null;
  onboarding_character_completed?: boolean | null;
}): boolean {
  return profile.onboarding_completed === true || profile.onboarding_character_completed === true;
}

export function resolveProfileRoute(profile: {
  onboarding_completed?: boolean | null;
  onboarding_character_completed?: boolean | null;
}): ProfileRoute {
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
  if (args.profileRoute === "character_gate") return "onboarding";
  if (!args.hasCharacter) return "hydrating";
  return "app";
}
