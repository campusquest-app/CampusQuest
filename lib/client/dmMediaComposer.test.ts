import { describe, expect, it } from "vitest";
import { validateDmImageFile, DM_ATTACH_MENU_ITEMS } from "./dmMediaComposer";

describe("dmMediaComposer", () => {
  it("validates image mime type", () => {
    const file = new File(["x"], "photo.jpg", { type: "image/jpeg" });
    Object.defineProperty(file, "size", { value: 1024 });
    expect(validateDmImageFile(file)).toBeNull();
  });

  it("rejects non-image files", () => {
    const file = new File(["x"], "doc.pdf", { type: "application/pdf" });
    Object.defineProperty(file, "size", { value: 1024 });
    expect(validateDmImageFile(file)).toMatch(/image/i);
  });

  it("only enables image in attach menu for now", () => {
    expect(DM_ATTACH_MENU_ITEMS.filter((item) => item.enabled)).toEqual([
      expect.objectContaining({ kind: "image" }),
    ]);
  });
});
