import { afterEach, describe, expect, it, vi } from "vitest";
import { serializeDiceBearAvatar, type DiceBearAvatarV2 } from "@/lib/dicebearAvatar";
import { resolveProfileAvatar } from "@/lib/avatarSource";
import { buildUserStatePatchBodies } from "@/lib/client/gameStateSync";
import { openAvatarDraft, saveAvatarDraft } from "@/lib/profile/avatarLabSession";
import { createCharacter, getCharacter, subscribeCharacterAvatar } from "@/lib/store";

function installStorage() {
  const store = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  };
  vi.stubGlobal("localStorage", localStorage);
  vi.stubGlobal("window", { localStorage });
  return store;
}

const savedLook: DiceBearAvatarV2 = {
  v: 2,
  style: "lorelei",
  seed: "existing-hero",
  options: { hair: "long", hairColor: "auburn" },
};

describe("avatar lab save and cancel", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps the stored avatar when the editor is opened and canceled", () => {
    installStorage();
    const original = serializeDiceBearAvatar(savedLook);
    createCharacter("Avery", original, "avery");
    const character = getCharacter();
    expect(character?.avatar).toBe(original);

    const draft = openAvatarDraft(character!);
    expect(draft).toBe(original);
    expect(getCharacter()?.avatar).toBe(original);
  });

  it("updates the profile immediately, notifies the nav, and survives reload", () => {
    const storage = installStorage();
    const original = serializeDiceBearAvatar(savedLook);
    createCharacter("Avery", original, "avery");
    const next = serializeDiceBearAvatar({ ...savedLook, seed: "new-look", options: { hair: "short" } });

    const seen: string[] = [];
    const unsubscribe = subscribeCharacterAvatar(() => {
      seen.push(getCharacter()?.avatar ?? "");
    });

    const saved = saveAvatarDraft(next);
    unsubscribe();

    expect(saved?.avatar).toBe(next);
    expect(getCharacter()?.avatar).toBe(next);
    expect(seen).toContain(next);

    const reloaded = JSON.parse(storage.get("campusquest_character") ?? "{}") as { avatar?: string };
    expect(reloaded.avatar).toBe(next);
    expect(getCharacter()?.avatar).toBe(next);

    expect(buildUserStatePatchBodies(saved!).profile.avatarCustomJson).toBe(next);
    expect(resolveProfileAvatar({ avatar_custom_json: next, avatar_url: null })).toBe(next);
  });
});
