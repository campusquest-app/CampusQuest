import type { Character } from "@/lib/types";
import { updateCharacter } from "@/lib/store";
import { getDefaultDiceBearAvatar, parseDiceBearAvatar, serializeDiceBearAvatar } from "@/lib/dicebearAvatar";

/**
 * Draft shown when Avatar Lab opens. Existing DiceBear config is kept as-is.
 * Opening the editor does not write storage.
 */
export function openAvatarDraft(character: Pick<Character, "avatar" | "username">): string {
  const existing = parseDiceBearAvatar(character.avatar);
  return existing
    ? character.avatar
    : serializeDiceBearAvatar({
        ...getDefaultDiceBearAvatar(),
        seed: character.username.trim() || "campusquest-hero",
      });
}

/** Persist an avatar draft through the existing character save path. */
export function saveAvatarDraft(draft: string) {
  return updateCharacter({ avatar: draft });
}
