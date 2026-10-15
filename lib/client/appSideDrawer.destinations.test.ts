import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function sliceBetween(src: string, startToken: string, endToken: string): string {
  const start = src.indexOf(startToken);
  const end = src.indexOf(endToken, start + startToken.length);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return src.slice(start, end);
}

describe("hamburger drawer destinations", () => {
  const drawerSrc = readFileSync(join(process.cwd(), "components/AppSideDrawer.tsx"), "utf8");
  const dashboardSrc = readFileSync(join(process.cwd(), "components/Dashboard.tsx"), "utf8");
  const profileCardSrc = readFileSync(join(process.cwd(), "components/DrawerPlayerProfileCard.tsx"), "utf8");
  const discover = sliceBetween(drawerSrc, "const DISCOVER_NAV", "const ACCOUNT_NAV");
  const account = sliceBetween(drawerSrc, "const ACCOUNT_NAV", "const UTILITY_NAV");
  const utility = sliceBetween(drawerSrc, "const UTILITY_NAV", "function getDrawerMenuSections");

  it("organizes Discover and Your Account without duplicating bottom nav", () => {
    expect(discover).toContain('id: "friends"');
    expect(discover).toContain('label: "Friends"');
    expect(discover).toContain('id: "organizations"');
    expect(discover).toContain('label: "Organizations"');
    expect(discover).toContain('id: "greek-life"');
    expect(discover).toContain('label: "Greek Life"');
    expect(account).toContain('id: "settings"');
    expect(account).toContain('label: "Settings"');
    expect(account).toContain('id: "inbox"');
    expect(account).toContain('label: "Notifications"');
    expect(account).not.toContain('id: "help"');
    expect(utility).toContain('id: "help"');
    expect(utility).toContain('label: "Help & Support"');
    expect(drawerSrc).toContain('title: "Discover"');
    expect(drawerSrc).toContain('title: "Your Account"');
    expect(drawerSrc).toContain("Administration");
    expect(discover).not.toContain('id: "quad"');
    expect(discover).not.toContain('id: "realm"');
    expect(discover).not.toContain('id: "events"');
    expect(discover).not.toContain('id: "profile"');
    expect(account).not.toContain('id: "quad"');
    expect(drawerSrc).not.toContain('label: "Saved"');
  });

  it("reuses existing Friends, Organizations, Greek Life, and notification destinations", () => {
    const navigate = sliceBetween(dashboardSrc, "const handleDrawerNavigate", "const bottomNavActive");
    expect(navigate).toContain('case "friends"');
    expect(navigate).toContain('setTab("friends")');
    expect(navigate).toContain('case "organizations"');
    expect(navigate).toContain('navigateToTab("organizations")');
    expect(navigate).toContain('case "greek-life"');
    expect(navigate).toContain('setTab("quad")');
    expect(navigate).toContain('setQuadFeedTab("greek_life")');
    expect(navigate).toContain('case "inbox"');
    expect(navigate).toContain('setInboxSubTab("notifications")');
    expect(dashboardSrc).toContain("<FindFriends");
    expect(dashboardSrc).toContain("<OrganizationsHub");
    expect(dashboardSrc).toContain("<Inbox");
    const inboxSrc = readFileSync(join(process.cwd(), "components/Inbox.tsx"), "utf8");
    expect(inboxSrc).toContain("<NotificationsCenter");
    expect(inboxSrc).toContain('subTab === "notifications"');
  });

  it("opens the existing Settings and Help panels instead of placeholder screens", () => {
    expect(drawerSrc).toContain("<AppSettingsPanel");
    expect(drawerSrc).toContain("<AppHelpSupportPanel");
    expect(drawerSrc).toContain('if (id === "settings")');
    expect(drawerSrc).toContain('setPanel("settings")');
    expect(drawerSrc).toContain('if (id === "help")');
    expect(drawerSrc).toContain('setPanel("help")');
  });

  it("gates Admin Tools in the drawer and keeps the server-backed admin route", () => {
    expect(drawerSrc).toContain("showAdminNav");
    expect(drawerSrc).toContain('href="/internal/admin"');
    expect(drawerSrc).toContain("Admin Tools");
    expect(dashboardSrc).toContain("showAdminNav={moderationAdminNavVisible(pilotCampusState)}");
    const adminPage = readFileSync(join(process.cwd(), "app/internal/admin/page.tsx"), "utf8");
    expect(adminPage).toContain("AdminRouteSessionGate");
    const adminAuth = readFileSync(join(process.cwd(), "lib/server/adminAuth.ts"), "utf8");
    expect(adminAuth).toContain("requireAdminUser");
    expect(adminAuth).toContain("userHasPlatformAdminAccess");
    const accessRoute = readFileSync(join(process.cwd(), "app/api/internal/admin/access/route.ts"), "utf8");
    expect(accessRoute).toContain("requireAdminUser");
  });

  it("keeps the signed-in profile header tappable with real character data", () => {
    expect(profileCardSrc).toContain("character.avatar");
    expect(profileCardSrc).toContain("character.name");
    expect(profileCardSrc).toContain("character.username");
    expect(profileCardSrc).toContain("onOpenProfile");
    expect(profileCardSrc).toContain("<AvatarDisplay");
    expect(drawerSrc).toContain('onOpenProfile={() => handleItem("profile")}');
    expect(drawerSrc).not.toContain("placeholder");
  });

  it("anchors Help & Support with branding and version in the bottom utility area", () => {
    const footer = sliceBetween(drawerSrc, 'className="cq-drawer-footer', "</div>");
    expect(footer).toContain("utilityItems.map");
    expect(footer).toContain("handleItem(item.id)");
    expect(footer).toContain("Version {APP_VERSION}");
    expect(footer).toContain("env(safe-area-inset-bottom");
    const nav = sliceBetween(drawerSrc, '<nav className="cq-drawer-nav', "</nav>");
    expect(nav).not.toContain("utilityItems");
    expect(nav).toContain("overflow-y-auto");
  });

  it("supports swipe, backdrop, Escape, scroll lock, and 44px targets", () => {
    expect(dashboardSrc).toContain("useDrawerSwipeGestures");
    expect(drawerSrc).toContain('if (event.key !== "Escape") return');
    expect(drawerSrc).toContain("aria-label=\"Close menu\"");
    expect(drawerSrc).toContain('html.style.overflow = "hidden"');
    expect(drawerSrc).toContain('body.style.overflow = "hidden"');
    expect(drawerSrc).toContain("env(safe-area-inset-top");
    expect(drawerSrc).toContain("env(safe-area-inset-left");
    expect(drawerSrc).toContain("env(safe-area-inset-bottom");
    expect(drawerSrc).toContain("min-h-[44px]");
    expect(drawerSrc).toContain("overflow-y-auto");
    expect(drawerSrc).toContain("restore.focus");
    expect(drawerSrc).toContain("onNavigate(id)");
    expect(drawerSrc).toContain("onClose()");
  });
});
