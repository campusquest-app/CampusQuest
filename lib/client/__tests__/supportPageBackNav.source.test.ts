import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Support page back navigation", () => {
  const page = readFileSync(join(process.cwd(), "app/support/page.tsx"), "utf8");
  const nav = readFileSync(join(process.cwd(), "components/SupportPageBackNav.tsx"), "utf8");
  const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

  it("places a labeled chevron back control above the Support heading", () => {
    expect(page.indexOf("<SupportPageBackNav")).toBeLessThan(page.indexOf("Support & safety"));
    expect(nav).toContain("ChevronLeft");
    expect(nav).toContain("<span>Back</span>");
    expect(nav).toContain('aria-label="Go back"');
  });

  it("prefers same-origin history and falls back to the CampusQuest entry page", () => {
    expect(nav).toContain("canUseSameOriginHistoryBack");
    expect(nav).toContain("router.back()");
    expect(nav).toContain('href="/"');
    expect(nav).not.toContain("joincampusquest.com");
    expect(nav).not.toContain("window.location.href");
  });

  it("keeps a 44pt hit target, safe-area inset, and visible focus", () => {
    expect(css).toContain(".cq-support-back");
    expect(css).toContain("env(safe-area-inset-top");
    expect(css).toContain("min-height: 2.75rem");
    expect(css).toContain("min-width: 2.75rem");
    expect(css).toContain(".cq-support-back__btn:focus-visible");
  });
});
