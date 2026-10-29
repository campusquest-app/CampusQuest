import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

describe("Realm map pin visual scale", () => {
  it("keeps secondary pins smaller than landmarks, with selected at ~115%", () => {
    expect(css).toMatch(/\.marker-pin,[\s\S]*?width:\s*20px/);
    expect(css).toMatch(/\.cq-realm-marker--state-selected \.marker-pin,[\s\S]*?width:\s*23px/);
    expect(css).toMatch(/\.cq-realm-marker--major \.marker-pin,[\s\S]*?width:\s*32px/);
    expect(css).toMatch(
      /\.cq-realm-marker--major\.cq-realm-marker--state-selected \.marker-pin,[\s\S]*?width:\s*37px/,
    );
  });

  it("keeps live-event pins slightly more prominent than idle pins", () => {
    expect(css).toMatch(/\.cq-realm-marker--event \.marker-pin,[\s\S]*?width:\s*23px/);
    expect(css).toMatch(/\.cq-realm-marker--major\.cq-realm-marker--event \.marker-pin,[\s\S]*?width:\s*35px/);
  });

  it("keeps a 44px invisible hit target and zoom-responsive scaling", () => {
    expect(css).toMatch(/\.realm-marker::after,[\s\S]*?width:\s*44px/);
    expect(css).toMatch(/\.realm-marker::after,[\s\S]*?height:\s*44px/);
    expect(css).toContain("cq-realm-marker-hit");
    expect(css).toMatch(/\.cq-realm-marker-hit \{[\s\S]*?width:\s*44px/);
    expect(css).toMatch(/\.cq-realm-marker-hit \{[\s\S]*?pointer-events:\s*auto/);
    expect(css).toMatch(/\.marker-pin,\s*\n\.cq-realm-marker-pin \{[\s\S]*?pointer-events:\s*none/);
    expect(css).toMatch(/\.cq-realm-marker-badge-hit \{[\s\S]*?pointer-events:\s*auto/);
    expect(css).toMatch(/\.cq-event-countdown \{[\s\S]*?pointer-events:\s*none/);
    expect(css).toMatch(/\.marker-aura \{[\s\S]*?pointer-events:\s*none/);
    expect(css).toMatch(/\.cq-event-magic \{[\s\S]*?pointer-events:\s*none/);
    expect(css).toContain('data-zoom-tier="far"');
    expect(css).toContain("scale(0.82)");
    expect(css).toContain("scale(0.9)");
  });
});
