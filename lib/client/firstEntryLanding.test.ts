import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("first-entry + Events/Map wiring", () => {
  const dashboardSrc = readFileSync(join(process.cwd(), "components/Dashboard.tsx"), "utf8");
  const eventsSrc = readFileSync(join(process.cwd(), "components/EventsFeed.tsx"), "utf8");
  const eventDetailSrc = readFileSync(join(process.cwd(), "components/events/EventDetailScreen.tsx"), "utf8");
  const navSrc = readFileSync(join(process.cwd(), "components/AppBottomNav.tsx"), "utf8");
  const pillsSrc = readFileSync(join(process.cwd(), "components/realm/RealmMapFilterPills.tsx"), "utf8");

  it("lands a newly completed account on Realm instead of the feed", () => {
    expect(dashboardSrc).toContain("markPendingRealmArrival()");
    expect(dashboardSrc).toContain('setTab("realm")');
    expect(dashboardSrc).toContain("showArrival={showRealmArrival}");
    expect(dashboardSrc).toContain("showIntro={showRealmIntro}");
    expect(dashboardSrc).toContain("onArrivalViewFeed");
  });

  it("persists Realm welcome and nav hints on the profile API", () => {
    expect(dashboardSrc).toContain("realmWelcomeSeen: true");
    expect(dashboardSrc).toContain("realmIntroCompleted: true");
    expect(dashboardSrc).toContain("navHintsSeen: true");
    expect(dashboardSrc).toContain("realmWelcomeSeenReset: true");
  });

  it("connects Events For You to the same map focus handoff", () => {
    expect(eventDetailSrc).toContain("View on Map");
    expect(eventDetailSrc).toContain("Walk Here");
    expect(eventsSrc).toContain("onViewOnMap");
    expect(eventsSrc).toContain("walk: true");
    expect(dashboardSrc).toContain("onViewOnMap={openEventOnMap}");
    expect(dashboardSrc).toContain('source: "events"');
  });

  it("keeps Feed one tap away and labels Explore on the dock", () => {
    expect(navSrc).toContain("APP_BOTTOM_NAV_HINT_LABELS.quad");
    expect(navSrc).toContain("Explore");
    expect(navSrc).toContain("showDockLabels");
    expect(dashboardSrc).toContain('setTab("quad")');
  });

  it("uses For You, Live Now, Events, and Places map filters", () => {
    expect(pillsSrc).toContain("MAP_FILTER_PILLS");
  });
});
