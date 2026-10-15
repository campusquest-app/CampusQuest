import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const src = readFileSync(join(process.cwd(), "components/realm/CampusQuestMapMarker.tsx"), "utf8");

describe("CampusQuestMapMarker iOS hit-testing", () => {
  it("keeps overlay markers in overlayMouseTarget with their own pointer-events", () => {
    expect(src).toContain("overlayMouseTarget");
    expect(src).toContain('div.style.pointerEvents = "auto"');
    expect(src).toContain('div.style.touchAction = "manipulation"');
  });

  it("fires taps on pointerup so iOS WKWebView does not depend on synthesized click", () => {
    expect(src).toContain("onPointerUpTap");
    expect(src).toContain("fireTap");
    expect(src).toContain('div.addEventListener("pointerup", onPointerUpTap)');
    expect(src).toContain('div.addEventListener("click", onClickDom)');
  });
});
