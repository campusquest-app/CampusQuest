import { progressionRewardsEnabled } from "@/lib/featureFlags";
import { ApiError } from "@/lib/server/http";

/**
 * Launch gate for gamification that is hidden in the App Store build.
 * UI flags are not sufficient: reward routes and service writers call this
 * so a student session cannot grant XP, items, or combat rewards by URL.
 */
export function assertLaunchProgressionEnabled(): void {
  if (!progressionRewardsEnabled()) {
    throw new ApiError(404, "This feature is not available.", "FEATURE_DISABLED");
  }
}
