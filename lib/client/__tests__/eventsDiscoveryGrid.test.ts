import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const card = readFileSync(join(root, "components/events/EventDiscoveryCard.tsx"), "utf8");
const feed = readFileSync(join(root, "components/EventsFeed.tsx"), "utf8");
const css = readFileSync(join(root, "app/globals.css"), "utf8");

describe("Events discovery compact two-column grid", () => {
  it("renders tappable grid cards without a permanent View Event button", () => {
    expect(card).toContain('className="cq-event-card cq-event-card--grid"');
    expect(card).toContain('role="link"');
    expect(card).toContain("onClick={onView}");
    expect(card).toContain("formatEventCardStatusBadge");
    expect(card).toContain("eventInterestMatchLabel");
    expect(card).toContain("cq-event-card-match");
    expect(card).not.toContain("cq-event-card-action--view");
    expect(card).not.toContain("{athletics ? \"View Game\" : \"View Event\"}");
  });

  it("uses a two-column CSS grid on typical phone widths", () => {
    expect(css).toMatch(
      /\.cq-events-feed\s*\{[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/,
    );
    expect(css).toContain("cq-event-card--grid");
    expect(css).toContain("aspect-ratio: 4 / 3");
    expect(css).toContain("--cq-feed-bottom-clearance");
  });

  it("keeps For You and More on the shared compact grid", () => {
    expect(feed).toContain('className="cq-events-feed"');
    expect(feed).toContain("discoverySections.forYou.map(renderFeedCard)");
    expect(feed).toContain("discoverySections.more.map(renderFeedCard)");
    expect(feed).toContain("View All For You");
    expect(feed).toContain("priority={index < 4}");
  });
});
