import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { APP_BOTTOM_NAV_TABS } from "@/lib/client/appBottomNavTabs";
import { BOTTOM_NAV_SWIPE_TABS } from "@/lib/client/mobileGestures";

describe("primary bottom navigation destinations", () => {
  const navSrc = readFileSync(join(process.cwd(), "components/AppBottomNav.tsx"), "utf8");
  const dashboardSrc = readFileSync(join(process.cwd(), "components/Dashboard.tsx"), "utf8");
  const profileXpSrc = readFileSync(join(process.cwd(), "components/profile/ProfileXpCard.tsx"), "utf8");
  const characterSrc = readFileSync(join(process.cwd(), "components/CharacterCard.tsx"), "utf8");
  const progressSrc = readFileSync(join(process.cwd(), "components/ProgressHubScreen.tsx"), "utf8");
  const drawerSrc = readFileSync(join(process.cwd(), "components/AppSideDrawer.tsx"), "utf8");

  it("uses Feed, Messages, Explore/Map, Events, and Profile", () => {
    expect(APP_BOTTOM_NAV_TABS).toEqual(["quad", "inbox", "realm", "events", "character"]);
    expect(BOTTOM_NAV_SWIPE_TABS).toEqual(APP_BOTTOM_NAV_TABS);
    expect(navSrc).toContain("APP_BOTTOM_NAV_HINT_LABELS.events");
    expect(navSrc).toContain("onSelectTab(\"events\")");
    expect(navSrc).toContain("<Calendar");
    expect(navSrc).not.toContain('label="Leaderboard"');
    expect(navSrc).not.toContain("Trophy");
  });

  it("keeps Map as the center dock action", () => {
    expect(APP_BOTTOM_NAV_TABS[2]).toBe("realm");
    expect(navSrc).toContain("cq-dock-nav__map-btn");
    expect(navSrc).toContain('aria-label={mapActive ? "Explore, current page" : "Explore"}');
  });

  it("does not create a second Events page or change Feed/Messages/Profile routes", () => {
    expect(dashboardSrc.match(/<EventsFeed/g)?.length).toBe(1);
    expect(dashboardSrc).toContain('tab === "quad"');
    expect(dashboardSrc).toContain('tab === "inbox"');
    expect(dashboardSrc).toContain('tab === "character"');
    expect(dashboardSrc).toContain('TAB_QUERY_VALUES');
    expect(dashboardSrc).toContain('"events"');
  });

  it("keeps the existing Leaderboard route and Profile/Progress entries", () => {
    expect(dashboardSrc).toContain('"leaderboards"');
    expect(dashboardSrc).toContain("<Leaderboards");
    expect(dashboardSrc).toContain("onOpenLeaderboard={() => navigateToTab(\"leaderboards\")}");
    expect(dashboardSrc).toContain("onBack={goBackTab}");
    expect(profileXpSrc).toContain("Leaderboard");
    expect(characterSrc).toContain("Leaderboard");
    expect(progressSrc).toContain("Leaderboard");
    expect(drawerSrc).toContain('id: "leaderboards"');
    expect(drawerSrc).toContain('label: "Leaderboard"');
  });

  it("does not highlight Events while viewing Leaderboard", () => {
    const start = dashboardSrc.indexOf("const bottomNavActive");
    const end = dashboardSrc.indexOf("const bottomNavSwipeActive");
    const block = dashboardSrc.slice(start, end);
    expect(block).toContain('tab === "events"');
    expect(block).not.toContain("leaderboards");
  });
});
