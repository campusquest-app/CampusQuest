import { describe, expect, it } from "vitest";
import {
  isUserOwnedStoragePath,
  removeUserStorageObjects,
  storageRefFromPublicUrl,
} from "@/lib/server/userStorageCleanup";

describe("user storage cleanup", () => {
  it("treats user-prefix and conversation/user paths as owned", () => {
    expect(isUserOwnedStoragePath("user-1", "user-1/quad/a.jpg")).toBe(true);
    expect(isUserOwnedStoragePath("user-1", "convo-9/user-1/voice.m4a")).toBe(true);
    expect(isUserOwnedStoragePath("user-1", "other-user/a.jpg")).toBe(false);
    expect(isUserOwnedStoragePath("user-1", "convo-9/other-user/pic.jpg")).toBe(false);
    expect(isUserOwnedStoragePath("user-1", "shared/brand/logo.png")).toBe(false);
  });

  it("parses public storage URLs without inventing ownership", () => {
    const ref = storageRefFromPublicUrl(
      "https://example.supabase.co/storage/v1/object/public/quad-post-images/user-1/a.jpg",
    );
    expect(ref).toEqual({ bucket: "quad-post-images", path: "user-1/a.jpg" });
    expect(isUserOwnedStoragePath("user-1", ref!.path)).toBe(true);
    expect(isUserOwnedStoragePath("user-2", ref!.path)).toBe(false);
  });

  it("counts already-missing objects as failures without throwing", async () => {
    const admin = {
      storage: {
        from: () => ({
          remove: async () => ({ error: { message: "Object not found" } }),
        }),
      },
    } as any;
    await expect(
      removeUserStorageObjects(admin, [{ bucket: "quad-post-images", path: "user-1/gone.jpg" }]),
    ).resolves.toEqual({ removed: 0, failed: 1 });
  });
});
