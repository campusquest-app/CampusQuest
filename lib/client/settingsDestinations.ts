import type { SettingsActionId } from "@/components/AppSettingsPanel";

export type SettingsDrawerPanel =
  | "account"
  | "demographics"
  | "push-notifications"
  | "delete-account"
  | "privacy"
  | "blocked-users"
  | "tags-mentions"
  | "campus"
  | "appearance"
  | "sound";

export type SettingsDestination =
  | { kind: "drawer"; panel: SettingsDrawerPanel }
  | { kind: "profile" }
  | { kind: "inbox" }
  | { kind: "account-type" }
  | { kind: "sign-out" }
  | { kind: "qr" };

/** Where each Settings row goes. Campus never opens the general profile. */
export function settingsDestination(id: SettingsActionId): SettingsDestination {
  switch (id) {
    case "account":
      return { kind: "drawer", panel: "account" };
    case "account-type":
      return { kind: "account-type" };
    case "profile-character":
      return { kind: "profile" };
    case "demographics":
      return { kind: "drawer", panel: "demographics" };
    case "notifications":
      return { kind: "inbox" };
    case "push-notifications":
      return { kind: "drawer", panel: "push-notifications" };
    case "delete-account":
      return { kind: "drawer", panel: "delete-account" };
    case "privacy":
      return { kind: "drawer", panel: "privacy" };
    case "blocked-users":
      return { kind: "drawer", panel: "blocked-users" };
    case "tags-mentions":
      return { kind: "drawer", panel: "tags-mentions" };
    case "campus":
      return { kind: "drawer", panel: "campus" };
    case "qr-permissions":
      return { kind: "qr" };
    case "appearance":
      return { kind: "drawer", panel: "appearance" };
    case "sound":
      return { kind: "drawer", panel: "sound" };
    case "sign-out":
      return { kind: "sign-out" };
    default:
      return { kind: "drawer", panel: "account" };
  }
}

export function canConfirmAccountDeletion(confirmation: string): boolean {
  return confirmation.trim() === "DELETE";
}
