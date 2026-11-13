import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("New Post header vs feed selector layout", () => {
  const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
  const topNav = readFileSync(join(process.cwd(), "components/TopNav.tsx"), "utf8");
  const capacitor = readFileSync(join(process.cwd(), "native/capacitor.config.ts"), "utf8");
  const modal = readFileSync(join(process.cwd(), "lib/client/modalViewportCleanup.ts"), "utf8");

  it("hides the feed selector chrome while the composer is open", () => {
    expect(css).toContain("html[data-cq-create-post-open] .cq-quad-header-shell");
    expect(css).toContain("html[data-cq-create-post-open] .cq-feed-selector-layer");
    expect(css).toContain("z-index: 13000");
    expect(topNav).toContain('attributeFilter: ["data-cq-create-post-open"]');
    expect(topNav).toContain("setFeedMenuOpen(false)");
  });

  it("keeps New Post safe-area padding stable on iOS", () => {
    expect(css).toContain("var(--cq-safe-top, 0px)");
    expect(modal).toContain("rememberSafeTopInset");
    expect(capacitor).toContain('contentInset: "never"');
    expect(capacitor).not.toMatch(/contentInset:\s*"automatic"/);
  });
});
