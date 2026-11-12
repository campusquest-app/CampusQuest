import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PARTNER_DIRECTORY } from "@/lib/partners/partnerDirectory";
import { visiblePartners } from "@/lib/partners/partnerStatus";
import { countBusinessViews } from "@/lib/partners/communityVisits";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

const DAISY = "daisys-chicken-ice-cream";
const SANDBAR = "the-sandbar-cafe";

describe("Community business views", () => {
  const listed = visiblePartners(PARTNER_DIRECTORY).map((partner) => partner.id);

  it("includes every listed business, including ones without an offer", () => {
    expect(listed).toContain(DAISY);
    expect(listed).toContain(SANDBAR);
    expect(listed).toContain("international-pocket-cafe");
    expect(PARTNER_DIRECTORY.find((partner) => partner.id === SANDBAR)?.discountValue).toBeNull();
  });

  it("counts Daisy's once when it is both featured and in the explore list", () => {
    const counts = countBusinessViews([
      { visitId: "visit-1", partnerIds: [DAISY, DAISY, SANDBAR, ...listed] },
    ]);
    expect(counts[DAISY]).toBe(1);
    expect(counts[SANDBAR]).toBe(1);
  });

  it("ignores a retry of the same visit and counts a later visit", () => {
    const first = { visitId: "visit-1", partnerIds: listed };
    const retry = { visitId: "visit-1", partnerIds: [DAISY, SANDBAR] };
    const later = { visitId: "visit-2", partnerIds: listed };
    const once = countBusinessViews([first]);
    const retried = countBusinessViews([first, retry]);
    const returned = countBusinessViews([first, retry, later]);
    expect(once[DAISY]).toBe(1);
    expect(once[SANDBAR]).toBe(1);
    expect(retried).toEqual(once);
    expect(returned[DAISY]).toBe(2);
    expect(returned[SANDBAR]).toBe(2);
  });
});

describe("business view wiring", () => {
  it("records a visit from the server listing and shows the count on the selected business", () => {
    const route = read("app/api/partners/community-visit/route.ts");
    const screen = read("components/partners/PartnersScreen.tsx");
    const dashboard = read("components/localBusiness/BusinessProfileScreen.tsx");
    const profile = read("app/api/local-business/profile/route.ts");
    expect(route).toContain("visiblePartners(PARTNER_DIRECTORY)");
    expect(route).not.toMatch(/body\??\.(partnerIds|partner_ids)/);
    expect(route).toContain('role === "local_business"');
    expect(screen).toContain("recordCommunityVisit(visitId)");
    expect(screen).toContain('state.status !== "ready"');
    expect(dashboard).toContain('label="Business views"');
    expect(dashboard).toContain("Counts each student visit to Community while your business is listed.");
    expect(dashboard).toContain("col-span-2");
    expect(dashboard).not.toContain("Offer redemptions");
    expect(dashboard).not.toContain("Offer views");
    expect(profile).toContain('.eq("event_type", "business_view")');
    expect(profile).toContain('.eq("partner_id", partnerId)');
  });
});
