import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/client/dashboardApi", () => ({ fetchAuthed: vi.fn() }));

import { verifiedSchoolAffiliation } from "@/lib/client/profileAffiliation";
import { getVisibleProfileTabs, visibleProfileTabFor } from "./ProfileTabNav";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const page = read("components/profile/ProfileSocialPage.tsx");
const header = read("components/profile/ProfileSocialHeader.tsx");
const stats = read("components/profile/ProfileStatsRow.tsx");
const grid = read("components/profile/ProfilePostsGrid.tsx");
const actions = read("components/profile/ProfileActionButtons.tsx");
const css = read("app/globals.css");

describe("verified school affiliation", () => {
  it("shows only a genuinely verified school", () => {
    expect(
      verifiedSchoolAffiliation({ verification: { status: "verified", schoolName: " University of Rhode Island " } }),
    ).toBe("University of Rhode Island");
    expect(verifiedSchoolAffiliation({ verification: { status: "pending", schoolName: "URI" } })).toBeNull();
    expect(verifiedSchoolAffiliation({ verification: { status: "verified", schoolName: "  " } })).toBeNull();
    expect(verifiedSchoolAffiliation(null)).toBeNull();
  });

  it("never shows the synthetic pilot school granted to admin / tester bypasses", () => {
    const verification = { status: "verified", schoolName: "University of Rhode Island" };
    expect(verifiedSchoolAffiliation({ verification, platformAdminAccess: true })).toBeNull();
    expect(verifiedSchoolAffiliation({ verification, internalTesterAccess: true })).toBeNull();
  });

  it("is only requested for the owner's personal profile", () => {
    expect(page).toContain("useOwnSchoolAffiliation(isOwner && showLevel && !identitySubtitle ? viewer.id : null)");
    expect(header).toMatch(/schoolAffiliation && !identitySubtitle/);
  });
});

describe("profile tabs", () => {
  it("moves Tagged into a Posts filter without dropping the tagged state", () => {
    expect(getVisibleProfileTabs({ codex: false }).map((t) => t.id)).toEqual(["posts", "memories", "activity"]);
    expect(visibleProfileTabFor("tagged")).toBe("posts");
    expect(visibleProfileTabFor("anonymous")).toBe("posts");
    expect(visibleProfileTabFor("memories")).toBe("memories");
    expect(page).toContain('tab === "posts" || tab === "tagged" || tab === "anonymous"');
    expect(page).toContain("includeAnonymous={isOwner}");
    expect(page).toContain('if (next === "anonymous" && !isOwner) return;');
    expect(page).toContain('if (!isOwner && tab === "anonymous") setTab("posts");');
    expect(page).toMatch(/tab === "tagged" \? \(\s*<ProfilePostsGrid\s+posts=\{taggedPosts\}/);
    expect(page).toContain('if (tab !== "tagged" || locked) return;');
  });
});

describe("profile header layout", () => {
  it("keeps the bio and Add bio inside the identity column", () => {
    const column = header.slice(header.indexOf("cq-profile-identity"), header.indexOf("</header>"));
    expect(column).toContain("cq-profile-bio");
    expect(column).toContain("+ Add bio");
    expect(header).toContain("isOwner && onEditBio ?");
  });

  it("top-aligns the avatar with the identity column", () => {
    expect(css).toMatch(/\.cq-profile-header-row \{[^}]*align-items: flex-start/);
  });
});

describe("compact stats keep their navigation", () => {
  it("still renders Friends as a button and keeps counts", () => {
    expect(stats).toContain("onClick={item.onClick}");
    expect(stats).toContain("useCountUp");
    expect(page).toMatch(/label: "Friends",[\s\S]*?onClick: onFriendsPress/);
    expect(page).toMatch(/label: "Following",\s*value: followingCount/);
    expect(css).toMatch(/\.cq-profile-stat \{[^}]*flex-direction: row/);
  });
});

describe("owner controls are preserved", () => {
  it("keeps Edit Profile, Share Profile, and Settings", () => {
    expect(actions).toContain("Edit Profile");
    expect(actions).toContain("Share Profile");
    expect(actions).toContain('aria-label="Settings"');
    expect(actions).toContain("nativeShare(");
    expect(page).toContain("onEditProfile={onEditIdentity}");
  });
});

describe("posts grid", () => {
  it("uses rounded tiles, even gutters, and one engagement indicator", () => {
    expect(css).toMatch(/\.cq-profile-posts-grid,\s*\.cq-profile-memories-grid \{[^}]*gap: 0\.25rem/);
    expect(css).toMatch(/\.cq-profile-post-tile,\s*\.cq-profile-memory-tile \{[^}]*border-radius: 0\.5rem/);
    expect(grid).toContain("<EngagementIndicator note={note} />");
    expect(grid).not.toContain("♥");
  });
});
