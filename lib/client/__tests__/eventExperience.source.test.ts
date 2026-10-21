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
    expect(cardSrc).toContain("formatEventCardStatusBadge");
    expect(cardSrc).toContain("Interested");
    expect(cardSrc).toContain("View Game");
    expect(cardSrc).toContain("View Event");
    expect(cardSrc).toContain("cq-event-card--immersive");
    expect(cardSrc).toContain("feedEventHostPresentation");
    expect(cardSrc).toContain("cq-event-card-host");
    expect(cardSrc).toContain("Hosted by");
    expect(cardSrc).toContain('role="link"');
    expect(cardSrc).not.toContain("cq-event-card-action--view");
    expect(cardSrc).not.toContain("toLocaleString");
    expect(cardSrc).not.toContain("View on URInvolved");
    expect(cardSrc).not.toContain("View full listing on URInvolved");
    expect(cardSrc).not.toContain("eventSourceChipLabel");
  });

  it("renders a complete in-app detail page with secondary URInvolved source", () => {
    expect(detailSrc).toContain("createPortal");
    expect(detailSrc).toContain("document.body");
    expect(detailSrc).toContain('document.body.style.overflow = "hidden"');
    expect(detailSrc).toContain("CQ_BOTTOM_NAV_CLEARANCE");
    expect(detailSrc).toContain("event.title");
    expect(detailSrc).toContain("flyer");
    expect(detailSrc).toContain("formatEventDateLine");
    expect(detailSrc).toContain("formatEventTimeLine");
    expect(detailSrc).toContain("Hosted by");
    expect(detailSrc).toContain("About This Event");
    expect(detailSrc).toContain("What You Need to Know");
    expect(detailSrc).toContain("Add to Calendar");
    expect(detailSrc).toContain("Share");
    expect(detailSrc).toContain("Interested");
    expect(detailSrc).toContain("View on Map");
    expect(detailSrc).not.toContain("Walk Here");
    expect(detailSrc).toContain("eventViewOnMapEligible");
    expect(detailSrc).toContain("eventSourceActionLabel");
    expect(detailSrc).toContain("More Info on URInvolved");
    expect(detailSrc).toContain("Read More");
    expect(detailSrc).toContain("Event unavailable");
    expect(detailSrc).toContain("openExternalUrl");
    expect(detailSrc).toContain("nativeShare");
    expect(detailSrc).toContain("downloadEventIcs");
    expect(detailSrc).not.toContain("eventHasMappedLocation");
    expect(detailSrc).not.toMatch(/top:\s*["']var\(--cq-topnav-h/);
    expect(detailSrc).not.toContain("min-h-full");
    expect(detailSrc).not.toContain("toLocaleString");
  });

  it("keeps the events list mounted under the detail portal without inert thrash on back", () => {
    expect(feedSrc).toContain("<EventDetailScreen");
    expect(feedSrc).toContain("closeDetail");
    expect(feedSrc).toContain('backLabel="Events"');
    expect(feedSrc).not.toMatch(/if \(liveDetail\) \{\s*return \(/);
    expect(feedSrc).not.toContain("inert={liveDetail");
    expect(feedSrc).not.toContain("aria-hidden={liveDetail");
    expect(detailSrc).toContain("createEventDetailDismissHandle");
    expect(detailSrc).toContain("backLabel");
    expect(mapSrc).toContain('backLabel="Map"');
  });

  it("defaults discovery to For You and opens filters in a centered modal", () => {
    expect(feedSrc).toContain('timeframe: "for_you"');
    expect(feedSrc).toContain("EventsFilterSheet");
    expect(feedSrc).toContain("cq-events-filter-count");
    expect(feedSrc).toContain("EVENTS_SEARCH_PLACEHOLDER");
    expect(feedSrc).toContain("scoreEventsSearch");
    expect(feedSrc).toContain("nextInterestedRsvpStatus");
    expect(feedSrc).toContain("applyCampusRsvpStatus");
    const sheetSrc = readFileSync(join(process.cwd(), "components/events/EventsFilterSheet.tsx"), "utf8");
    expect(sheetSrc).toContain("CqModalLayer");
    expect(sheetSrc).toContain('placement="dialog"');
    expect(sheetSrc).toContain("Apply Filters");
    expect(sheetSrc).toContain("Reset");
    expect(sheetSrc).not.toContain("cq-create-sheet-overlay");
  });

  it("focuses the venue and selected event from Events View on Map", () => {
    expect(mapSrc).toContain('setMarkerFilter("events")');
    expect(mapSrc).toContain("setFocusedEventId(pending.eventId)");
    expect(mapSrc).toContain("focusedEventId={focusedEventId}");
    expect(mapSrc).toContain("findMapFocusForEvent");
    expect(feedSrc).not.toContain("walk: true");
    expect(feedSrc).not.toContain("onWalkHere");
  });
});
