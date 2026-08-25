import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Events experience source contracts", () => {
  const feedSrc = readFileSync(join(process.cwd(), "components/EventsFeed.tsx"), "utf8");
  const cardSrc = readFileSync(join(process.cwd(), "components/events/EventDiscoveryCard.tsx"), "utf8");
  const detailSrc = readFileSync(join(process.cwd(), "components/events/EventDetailScreen.tsx"), "utf8");
  const mapSrc = readFileSync(join(process.cwd(), "components/realm/RealmMap.tsx"), "utf8");

  it("keeps compact cards free of source CTAs and raw timestamps", () => {
    expect(cardSrc).toContain("formatEventDateTimeRange");
    expect(cardSrc).toContain("eventCardSummary");
    expect(cardSrc).toContain("Interested");
    expect(cardSrc).toContain("View");
    expect(cardSrc).not.toContain("toLocaleString");
    expect(cardSrc).not.toContain("View on URInvolved");
    expect(cardSrc).not.toContain("View full listing on URInvolved");
  });

  it("renders a complete in-app detail page with secondary URInvolved source", () => {
    expect(detailSrc).toContain("event.title");
    expect(detailSrc).toContain("flyer");
    expect(detailSrc).toContain("formatEventDateTimeRange");
    expect(detailSrc).toContain("Hosted by");
    expect(detailSrc).toContain("About");
    expect(detailSrc).toContain("Add to Calendar");
    expect(detailSrc).toContain("Share");
    expect(detailSrc).toContain("Interested");
    expect(detailSrc).toContain("View on Map");
    expect(detailSrc).toContain("Walk Here");
    expect(detailSrc).toContain("View full listing on URInvolved");
    expect(detailSrc).toContain("openExternalUrl");
    expect(detailSrc).toContain("nativeShare");
    expect(detailSrc).toContain("downloadEventIcs");
    expect(detailSrc).toContain("eventHasMappedLocation");
    expect(detailSrc).not.toMatch(/className="block w-full[\s\S]*View on URInvolved/);
    expect(detailSrc).not.toContain("toLocaleString");
  });

  it("defaults discovery to For You and hides filters in a sheet", () => {
    expect(feedSrc).toContain('timeframe: "for_you"');
    expect(feedSrc).toContain("EventsFilterSheet");
    expect(feedSrc).toContain("EVENTS_SEARCH_PLACEHOLDER");
    expect(feedSrc).toContain("scoreEventsSearch");
    expect(feedSrc).toContain("nextInterestedRsvpStatus");
    expect(feedSrc).toContain("applyCampusRsvpStatus");
  });

  it("starts Walk Here from the existing Realm map after focus", () => {
    expect(mapSrc).toContain("pendingWalkAfterFocusRef");
    expect(mapSrc).toContain("startWalkingRoute");
    expect(mapSrc).toContain("pending.walk === true");
  });
});
