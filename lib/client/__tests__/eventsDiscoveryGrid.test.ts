import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const card = readFileSync(join(root, "components/events/EventDiscoveryCard.tsx"), "utf8");
const artwork = readFileSync(join(root, "components/events/EventArtwork.tsx"), "utf8");
const feed = readFileSync(join(root, "components/EventsFeed.tsx"), "utf8");
const css = readFileSync(join(root, "app/globals.css"), "utf8");

describe("Events discovery compact two-column grid", () => {
  it("renders tappable immersive cards without a permanent View Event button", () => {
    expect(card).toContain("cq-event-card--immersive");
    expect(card).toContain('role="link"');
    expect(card).toContain("onClick={onView}");
    expect(card).toContain("formatEventCardStatusBadge");
    expect(card).toContain("eventInterestMatchLabel");
    expect(card).toContain("cq-event-card-match");
    expect(card).toContain("cq-event-card-copy");
    expect(card).toContain("resolveEventArtworkFit");
    expect(card).not.toContain("cq-event-card-action--view");
    expect(card).not.toContain("cq-event-card-scrim");
  });

  it("preserves flyer images with contain + blur fill and a balanced square frame", () => {
    expect(css).toMatch(
      /\.cq-events-feed\s*\{[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/,
    );
    expect(css).toContain("cq-event-card--immersive");
    expect(css).toContain("aspect-ratio: 1 / 1");
    expect(css).toContain("object-fit: contain");
    expect(css).toContain("cq-event-artwork__blur");
    expect(css).toContain("--cq-feed-bottom-clearance");
    expect(css).toMatch(/\.cq-event-card-badge--live\s*\{[\s\S]*rgba\(24,\s*96,\s*150/);
    expect(artwork).toContain("showBlurFill");
    expect(artwork).toContain("cq-event-artwork__blur");
    expect(artwork).toContain('data-cq-event-fit={fit}');
  });

  it("keeps For You and More on the shared compact grid", () => {
    expect(feed).toContain('className="cq-events-feed"');
    expect(feed).toContain("discoverySections.forYou.map(renderFeedCard)");
    expect(feed).toContain("discoverySections.more.map(renderFeedCard)");
    expect(feed).toContain("View All For You");
    expect(feed).toContain("priority={index < 4}");
  });
});
