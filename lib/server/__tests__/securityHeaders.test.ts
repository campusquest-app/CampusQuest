import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const nextConfig = require(path.resolve(__dirname, "../../../next.config.js")) as {
  headers: () => Promise<{ source: string; headers: { key: string; value: string }[] }[]>;
};

async function cspDirectives(): Promise<Map<string, string[]>> {
  const rules = await nextConfig.headers();
  const csp = rules.flatMap((rule) => rule.headers).find((h) => h.key === "Content-Security-Policy");
  expect(csp).toBeDefined();
  return new Map(
    csp!.value.split(";").map((part) => {
      const [name, ...sources] = part.trim().split(/\s+/);
      return [name, sources] as [string, string[]];
    }),
  );
}

describe("Content-Security-Policy", () => {
  it("lets Google Maps vector rendering start its blob: workers and load map style data", async () => {
    const csp = await cspDirectives();
    expect(csp.get("worker-src")).toEqual(expect.arrayContaining(["'self'", "blob:"]));
    expect(csp.get("connect-src")).toEqual(
      expect.arrayContaining(["https://maps.googleapis.com", "https://maps.gstatic.com", "https://www.gstatic.com"]),
    );
    expect(csp.get("script-src")).toEqual(
      expect.arrayContaining(["https://maps.googleapis.com", "https://maps.gstatic.com"]),
    );
  });

  it("keeps the security-closure restrictions", async () => {
    const csp = await cspDirectives();
    expect(csp.get("default-src")).toEqual(["'self'"]);
    expect(csp.get("object-src")).toEqual(["'none'"]);
    expect(csp.get("frame-ancestors")).toEqual(["'none'"]);
    expect(csp.get("base-uri")).toEqual(["'self'"]);
    csp.forEach((sources, name) => {
      expect(sources, name).not.toContain("*");
    });
    expect(csp.get("script-src")).not.toContain("blob:");
    expect(csp.get("worker-src")).not.toContain("https:");
  });
});
