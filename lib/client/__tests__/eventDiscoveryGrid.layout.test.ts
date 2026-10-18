import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("events discovery compact grid", () => {
  const css = readFileSync("app/globals.css", "utf8");
  const card = readFileSync("components/events/EventDiscoveryCard.tsx", "utf8");
  const feed = readFileSync("components/EventsFeed.tsx", "utf8");

  it("uses a two-column mobile feed grid with edge padding", () => {
    expect(css).toContain(".cq-events-feed {");
    expect(css).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
    expect(css).toContain("padding: 0 0.85rem");
    expect(css).toContain("minmax(0, 1fr)");
    expect(css).toMatch(/@media \(min-width: 720px\)[\s\S]*repeat\(3, minmax\(0, 1fr\)\)/);
  });

  it("makes the whole card the open target without a View Event button", () => {
    expect(card).toContain("cq-event-card-hit");
    expect(card).toContain("aria-label={`${openLabel}: ${title}`}");
    expect(card).not.toContain("cq-event-card-action--view");
    expect(card).not.toContain(">View Event<");
    expect(card).toContain("eventCardStatusBadge");
    expect(card).toContain("eventInterestMatchLabel");
    expect(card).toContain("loading={imagePriority ? \"eager\" : \"lazy\"}");
  });

  it("keeps For You and More events on the shared grid", () => {
    expect(feed).toContain("cq-events-feed");
    expect(feed).toContain("discoverySections.forYou.map");
    expect(feed).toContain("discoverySections.more.map");
    expect(feed).toContain("View All For You");
    expect(feed).toContain("imagePriority={index < 4}");
  });
});
