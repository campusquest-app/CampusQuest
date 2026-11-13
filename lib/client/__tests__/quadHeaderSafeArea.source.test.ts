import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Quad Home header safe-area clamp", () => {
  const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
  const quadSrc = readFileSync(join(process.cwd(), "components/TheQuad.tsx"), "utf8");
  const topNavSrc = readFileSync(join(process.cwd(), "components/TopNav.tsx"), "utf8");
  const scrollChromeSrc = readFileSync(join(process.cwd(), "lib/client/useScrollChrome.ts"), "utf8");
  const capacitorSrc = readFileSync(join(process.cwd(), "native/capacitor.config.ts"), "utf8");

  it("keeps the fixed header outside the bouncing feed scroller", () => {
    expect(quadSrc).toContain("cq-quad-scroll-root");
    expect(quadSrc).toContain("data-cq-quad-scroll-root");
    expect(quadSrc).toContain("scrollRootRef");
    expect(quadSrc).not.toContain('setAttribute("data-cq-quad-scroll-root"');
    expect(css).toContain("html[data-cq-on-quad]");
    expect(css).toContain("overscroll-behavior: none");
    expect(css).toContain(".cq-quad-scroll-root");
  });

  it("clamps the header transform so it cannot translate below its fully visible seat", () => {
    expect(css).toContain("min(0px, calc(var(--cq-hide) * -100%))");
    expect(scrollChromeSrc).toContain("resolveBottomNavScrollRoot");
    expect(scrollChromeSrc).toContain("Math.max(0, readScrollY");
  });

  it("applies the top safe-area inset once in CSS and disables Capacitor automatic inset", () => {
    expect(topNavSrc).toContain('paddingTop: "env(safe-area-inset-top, 0px)"');
    expect(capacitorSrc).toContain('contentInset: "never"');
    expect(capacitorSrc).not.toMatch(/contentInset:\s*"automatic"/);
  });
});
