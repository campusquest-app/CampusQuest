import { hasValidRoleSelection } from "@/lib/roles";
import {
  isDemographicsRequired,
  type DemographicPreferencesSnapshot,
  type DemographicProfileSnapshot,
} from "@/lib/onboarding/demographicOnboardingPolicy";
import { isDisplayNameSetupRequired } from "@/lib/onboarding/displayNameOnboardingPolicy";
import { isCampusEmailVerificationRequired } from "@/lib/campusEmailVerification";

export type BootstrapStatus = "bootstrapping" | "unauthenticated" | "authenticated";

/**
 * Resolved after profile (+ demographics prefs) fetch.
 * Order: display name → demographics → campus email (if setup incomplete) → character → role → app
 */
export type ProfileRoute =
  | "unknown"
  | "display_name_gate"
  | "demographics_gate"
  | "role_gate"
  | "character_gate"
  | "app";

export type AppShellRoute =
  | "loading"
  | "hydrating"
  | "auth"
  | "display_name"
  | "demographics"
  | "role_selection"
  | "onboarding"
  | "app";

export type ProfileRouteInput = DemographicProfileSnapshot & {
  role?: string | null;
  is_test_user?: boolean | null;
  qa_selected_role?: string | null;
  display_name?: string | null;
  display_name_changed_at?: string | null;
  username?: string | null;
};

export type ResolveProfileRouteOptions = {
  preferences?: DemographicPreferencesSnapshot | null;
  forceDemographicsQaReplay?: boolean;
  forceCharacterQaReplay?: boolean;
};

export function isProfileSetupComplete(profile: ProfileRouteInput): boolean {
  return profile.onboarding_completed === true || profile.onboarding_character_completed === true;
}

/**
 * Authenticated routing:
 * 1) display name (when required)
 * 2) demographics (when required, including QA replay)
 * 3) campus email verification when demographics are done and setup is not
 * 4) character setup
 * 5) role gate (existing users missing role)
 * 6) app
 *
 * Email verification must not run before the demographics gate decides the
 * user's current onboarding step. Completed character/app users are not
 * pulled back into onboarding solely because email is unverified.
 */
export function resolveProfileRoute(
  profile: ProfileRouteInput,
  options?: ResolveProfileRouteOptions,
): ProfileRoute {
  if (isDisplayNameSetupRequired(profile)) {
    return "display_name_gate";
  }

  if (
    isDemographicsRequired({
      profile,
      preferences: options?.preferences,
      forceQaReplay: options?.forceDemographicsQaReplay === true,
    })
  ) {
    return "demographics_gate";
  }

  if (isCampusEmailVerificationRequired(profile) && !isProfileSetupComplete(profile)) {
    return "demographics_gate";
  }

  const routingProfile: ProfileRouteInput =
    options?.forceCharacterQaReplay === true
      ? {
          ...profile,
          onboarding_completed: false,
          onboarding_character_completed: false,
        }
      : profile;

  const setupComplete = isProfileSetupComplete(routingProfile);
  if (!hasValidRoleSelection(routingProfile)) {
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
  if (args.profileRoute === "display_name_gate") return true;
  if (args.profileRoute === "demographics_gate") return true;
  if (args.profileRoute === "character_gate") return true;
  if (args.profileRoute === "role_gate") return true;
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
  if (args.profileRoute === "display_name_gate") return "display_name";
  if (args.profileRoute === "demographics_gate") return "demographics";
  if (args.profileRoute === "role_gate") return "role_selection";
  if (args.profileRoute === "character_gate") return "onboarding";
  if (!args.hasCharacter) return "hydrating";
  return "app";
}
