import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("business profile header", () => {
  const header = readFileSync(join(process.cwd(), "components/localBusiness/BusinessProfileHeader.tsx"), "utf8");
  const screen = readFileSync(join(process.cwd(), "components/localBusiness/BusinessProfileScreen.tsx"), "utf8");

  it("clips the cover inside the banner and lets the name wrap below it", () => {
    expect(header).toContain('className="h-36 overflow-hidden rounded-t-3xl bg-black/40"');
    expect(header).toContain('className="relative z-10 -mt-10 h-20 w-20 shrink-0 overflow-hidden rounded-2xl border-2 border-uri-navy bg-black"');
    expect(header).toContain('className="min-w-0 flex-1 pt-3"');
    expect(header).toContain('className="break-words text-xl font-bold leading-tight"');
    expect(header).not.toContain("truncate");
    expect(header).not.toContain("items-end");
    expect(screen).toContain("<BusinessProfileHeader");
    expect(screen).not.toContain("overflow-hidden rounded-3xl");
    expect(screen).toContain('className="rounded-3xl border border-white/10 bg-uri-navy"');
  });
});