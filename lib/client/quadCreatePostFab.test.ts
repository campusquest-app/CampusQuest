import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const fab = readFileSync(join(root, "components/QuadCreatePostFab.tsx"), "utf8");

describe("Quad create FAB", () => {
  it("opens the Quad composer immediately without a Create chooser", () => {
    expect(existsSync(join(root, "components/QuadCreateActionSheet.tsx"))).toBe(false);
    expect(fab).not.toContain("QuadCreateActionSheet");
    expect(fab).not.toContain("Create Quad Post");
    expect(fab).toContain("startPostFlow");
    expect(fab).toContain("handleFabTap");
    expect(fab).toContain("FieldNoteComposer");
    expect(fab).toContain("PostMediaPicker");
  });

  it("does not reopen the composer from a second FAB tap while it is already open", () => {
    expect(fab).toContain("if (open) return;");
  });
});
