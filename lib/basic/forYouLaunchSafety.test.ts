import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { forYouSurface, shouldPersonalizeForYouEvents } from "@/lib/basic/forYouAccess";
import { eventsEmptyStateCopy } from "@/lib/client/eventsFeedEmptyState";

const ROOT = join(process.cwd());

const PRODUCTION_SCAN_DIRS = ["app", "components", "lib", "native"];

const FORBIDDEN_USER_FACING = [
  "joincampusquest.com/billing",
  "Get CampusQuest Basic",
  "Unlock For You",
  "CAMPUSQUEST_BASIC_BILLING_URL",
];

function walkFiles(dir: string, acc: string[] = []): string[] {
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const name of entries) {
    if (name === "node_modules" || name === ".next" || name === "coverage") continue;
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walkFiles(full, acc);
      continue;
    }
    if (/\.(ts|tsx|js|jsx|md|html|json)$/.test(name)) acc.push(full);
  }
  return acc;
}

describe("CampusQuest 1.0 For You launch safety", () => {
  it("personalizes For You for a user with no entitlement record", () => {
    expect(shouldPersonalizeForYouEvents({ timeframe: "for_you", searching: false })).toBe(true);
    expect(forYouSurface({ timeframe: "for_you", searching: false })).toBe("browse");
  });

  it("keeps Today as a separate free discovery tab", () => {
    expect(shouldPersonalizeForYouEvents({ timeframe: "today", searching: false })).toBe(false);
    expect(forYouSurface({ timeframe: "today", searching: false })).toBe("browse");
    expect(eventsEmptyStateCopy({ hasLoadedEvents: true, timeframe: "today" }).title).toBe(
      "Nothing scheduled for today",
    );
  });

  it("does not generate an upgrade empty state for For You", () => {
    const copy = eventsEmptyStateCopy({ hasLoadedEvents: true, timeframe: "for_you" });
    const combined = `${copy.title} ${copy.detail}`.toLowerCase();
    expect(combined).not.toContain("unlock");
    expect(combined).not.toContain("basic");
    expect(combined).not.toContain("billing");
    expect(combined).not.toContain("subscribe");
    expect(copy.action).not.toBe("upgrade");
  });

  it("has no reviewer-accessible billing or CampusQuest Basic CTA in production source", () => {
    const files = PRODUCTION_SCAN_DIRS.flatMap((dir) => walkFiles(join(ROOT, dir)));
    const hits: string[] = [];
    for (const file of files) {
      if (file.includes(".test.") || file.endsWith(".test.ts") || file.endsWith(".test.tsx")) continue;
      if (file.includes("/docs/")) continue;
      const text = readFileSync(file, "utf8");
      for (const needle of FORBIDDEN_USER_FACING) {
        if (text.includes(needle)) hits.push(`${file}: ${needle}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it("does not mount an upgrade screen from EventsFeed", () => {
    const source = readFileSync(join(ROOT, "components/EventsFeed.tsx"), "utf8");
    expect(source).not.toContain("ForYouUpgrade");
    expect(source).not.toContain("Unlock For You");
    expect(source).not.toContain("Get CampusQuest Basic");
    expect(source).not.toContain("joincampusquest.com");
    expect(source).not.toContain("useForYouAccess");
    expect(source).not.toContain("cq_basic_access");
    expect(source).toContain("shouldPersonalizeForYouEvents");
    expect(source).toContain('timeframe: "for_you"');
    expect(source).toContain("EventDetailScreen");
  });

  it("does not ship a For You upgrade component", () => {
    expect(() => readFileSync(join(ROOT, "components/events/ForYouUpgrade.tsx"), "utf8")).toThrow();
  });
});
