/**
 * Resolve CharacterGate identity from the existing profile created at signup.
 * Username must never be re-collected; display name defaults from profile.
 */

const USERNAME_REGEX = /^[a-z0-9_]+$/;
const USERNAME_MAX = 25;
const NAME_MAX = 40;

export function normalizeCharacterUsername(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, USERNAME_MAX);
}

export function resolveCharacterGateIdentity(profile: {
  username?: string | null;
  display_name?: string | null;
}): { username: string; displayName: string; usernameValid: boolean; displayNameValid: boolean } {
  const username = normalizeCharacterUsername(profile.username ?? "");
  const fromProfile = profile.display_name?.trim() ?? "";
  const displayName = (fromProfile || username.replace(/_/g, " ") || "CampusQuest Player").slice(0, NAME_MAX);
  const usernameValid =
    username.length >= 3 && username.length <= USERNAME_MAX && USERNAME_REGEX.test(username);
  const displayNameValid = displayName.length >= 1 && displayName.length <= NAME_MAX;
  return { username, displayName, usernameValid, displayNameValid };
}
