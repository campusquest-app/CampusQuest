import { describe, expect, it } from "vitest";
import {
  derivePartnerDisplayState,
  groupPartnersForDisplay,
  hasVisiblePartners,
  mapPartnerRow,
} from "@/lib/partners/partnerStatus";
import type { Partner, PartnerRow } from "@/lib/partners/types";

const NOW = new Date("2026-10-05T12:00:00Z");

function partner(overrides: Partial<Partner> = {}): Partner {
  return {
    id: "test-id",
    name: "Test Partner",
    slug: "test-partner",
    logoUrl: null,
    coverImageUrl: null,
    category: null,
    description: null,
    address: null,
    latitude: null,
    longitude: null,
    partnerSince: null,
    offerType: null,
    offerTitle: null,
    offerDescription: null,
    discountValue: null,
    questTitle: null,
    questDescription: null,
    redemptionInstructions: null,
    startsAt: null,
    endsAt: null,
    websiteUrl: null,
    instagramUrl: null,
    isActive: true,
    isFeatured: false,
    isCampusQuestDay: false,
    ...overrides,
  };
}

describe("derivePartnerDisplayState", () => {
  it("treats an active partner with no schedule as active", () => {
    expect(derivePartnerDisplayState(partner(), NOW)).toBe("active");
  });

  it("is inactive whenever is_active is false, regardless of dates", () => {
    expect(derivePartnerDisplayState(partner({ isActive: false }), NOW)).toBe("inactive");
    expect(
      derivePartnerDisplayState(partner({ isActive: false, endsAt: "2026-01-01T00:00:00Z" }), NOW),
    ).toBe("inactive");
  });

  it("is expired once ends_at has passed (inclusive)", () => {
    expect(derivePartnerDisplayState(partner({ endsAt: "2026-10-05T11:59:59Z" }), NOW)).toBe("expired");
    expect(derivePartnerDisplayState(partner({ endsAt: NOW.toISOString() }), NOW)).toBe("expired");
  });

  it("is upcoming before starts_at", () => {
    expect(derivePartnerDisplayState(partner({ startsAt: "2026-10-06T00:00:00Z" }), NOW)).toBe("upcoming");
  });

  it("is active inside the window and ignores unparseable dates", () => {
    expect(
      derivePartnerDisplayState(
        partner({ startsAt: "2026-10-01T00:00:00Z", endsAt: "2026-10-10T00:00:00Z" }),
        NOW,
      ),
    ).toBe("active");
    expect(derivePartnerDisplayState(partner({ endsAt: "not-a-date" }), NOW)).toBe("active");
  });
});

describe("groupPartnersForDisplay", () => {
  it("returns empty sections for zero partners", () => {
    const sections = groupPartnersForDisplay([], NOW);
    expect(sections).toEqual({ featured: [], active: [], expired: [] });
    expect(hasVisiblePartners(sections)).toBe(false);
  });

  it("splits featured, active and expired; hides inactive and upcoming", () => {
    const featured = partner({ id: "f", isFeatured: true });
    const active = partner({ id: "a" });
    const expired = partner({ id: "e", endsAt: "2026-09-01T00:00:00Z" });
    const expiredFeatured = partner({ id: "ef", isFeatured: true, endsAt: "2026-09-01T00:00:00Z" });
    const inactive = partner({ id: "i", isActive: false });
    const upcoming = partner({ id: "u", startsAt: "2026-12-01T00:00:00Z" });

    const sections = groupPartnersForDisplay([featured, active, expired, expiredFeatured, inactive, upcoming], NOW);
    expect(sections.featured.map((p) => p.id)).toEqual(["f"]);
    expect(sections.active.map((p) => p.id)).toEqual(["a"]);
    expect(sections.expired.map((p) => p.id)).toEqual(["e", "ef"]);
    expect(hasVisiblePartners(sections)).toBe(true);
  });

  it("shows nothing when every partner is inactive or upcoming", () => {
    const sections = groupPartnersForDisplay(
      [partner({ isActive: false }), partner({ startsAt: "2027-01-01T00:00:00Z" })],
      NOW,
    );
    expect(hasVisiblePartners(sections)).toBe(false);
  });
});

describe("mapPartnerRow", () => {
  it("maps every snake_case column and rejects unknown offer types", () => {
    const row: PartnerRow = {
      id: "row-id",
      name: "Row Partner",
      slug: "row-partner",
      logo_url: "https://cdn.test/logo.png",
      cover_image_url: "https://cdn.test/cover.png",
      category: "Food",
      description: "desc",
      address: "1 Test St",
      latitude: 41.48,
      longitude: -71.52,
      partner_since: "2026-10-01",
      offer_type: "campusquest_day",
      offer_title: "Offer",
      offer_description: "Offer desc",
      discount_value: "15%",
      quest_title: "Quest",
      quest_description: "Quest desc",
      redemption_instructions: "Show the app",
      starts_at: "2026-10-01T00:00:00Z",
      ends_at: "2026-10-31T00:00:00Z",
      website_url: "https://example.test",
      instagram_url: "https://instagram.com/test",
      is_active: true,
      is_featured: true,
      is_campusquest_day: true,
    };
    const mapped = mapPartnerRow(row);
    expect(mapped).toMatchObject({
      id: "row-id",
      logoUrl: "https://cdn.test/logo.png",
      coverImageUrl: "https://cdn.test/cover.png",
      partnerSince: "2026-10-01",
      offerType: "campusquest_day",
      discountValue: "15%",
      redemptionInstructions: "Show the app",
      isFeatured: true,
      isCampusQuestDay: true,
    });
    expect(Object.keys(mapped)).toHaveLength(Object.keys(row).length);
    expect(mapPartnerRow({ ...row, offer_type: "bogus" as never }).offerType).toBeNull();
  });
});
