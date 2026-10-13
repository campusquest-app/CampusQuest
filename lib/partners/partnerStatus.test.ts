import { describe, expect, it } from "vitest";
import { definePartner } from "@/lib/partners/partnerDirectory";
import {
  filterPartners,
  isOfferLive,
  mapPartnerRow,
  partnerDirectionsUrl,
  partnerHasLiveReward,
  partnerPrimaryLink,
  visiblePartners,
} from "@/lib/partners/partnerStatus";
import type { Partner, PartnerRow } from "@/lib/partners/types";

const NOW = new Date("2026-10-05T12:00:00Z");

function partner(overrides: Partial<Partner> = {}): Partner {
  return definePartner({ id: "test-id", name: "Test Partner", slug: "test-partner", ...overrides });
}

describe("visiblePartners", () => {
  it("drops inactive partners and keeps data order", () => {
    const list = [partner({ id: "a" }), partner({ id: "b", isActive: false }), partner({ id: "c" })];
    expect(visiblePartners(list).map((p) => p.id)).toEqual(["a", "c"]);
  });
});

describe("isOfferLive / partnerHasLiveReward", () => {
  it("is live with no schedule", () => {
    expect(isOfferLive(partner(), NOW)).toBe(true);
  });

  it("is not live before startsAt or once endsAt has passed (inclusive)", () => {
    expect(isOfferLive(partner({ startsAt: "2026-10-06T00:00:00Z" }), NOW)).toBe(false);
    expect(isOfferLive(partner({ endsAt: NOW.toISOString() }), NOW)).toBe(false);
    expect(isOfferLive(partner({ endsAt: "not-a-date" }), NOW)).toBe(true);
  });

  it("requires a configured discount or title", () => {
    expect(partnerHasLiveReward(partner(), NOW)).toBe(false);
    expect(partnerHasLiveReward(partner({ discountValue: "20% OFF" }), NOW)).toBe(true);
    expect(partnerHasLiveReward(partner({ discountValue: "20% OFF", endsAt: "2026-09-01T00:00:00Z" }), NOW)).toBe(
      false,
    );
  });
});

describe("filterPartners", () => {
  const daisys = partner({
    id: "d",
    name: "Daisy\u2019s Chicken & Ice Cream",
    categories: ["Chicken", "Ice Cream"],
    address: "106 Point Judith Rd, Narragansett, RI",
  });
  const sandbar = partner({
    id: "s",
    name: "The Sandbar Cafe",
    categories: ["Coffee", "Breakfast", "Drinks"],
    address: "106 Point Judith Rd, Narragansett, RI",
  });
  const list = [daisys, sandbar];

  it("returns everything for a blank query", () => {
    expect(filterPartners(list, "   ")).toEqual(list);
  });

  it("matches name case-insensitively, with or without the apostrophe", () => {
    expect(filterPartners(list, "daisy").map((p) => p.id)).toEqual(["d"]);
    expect(filterPartners(list, "DAISYS").map((p) => p.id)).toEqual(["d"]);
    expect(filterPartners(list, "daisy's").map((p) => p.id)).toEqual(["d"]);
  });

  it("matches categories", () => {
    expect(filterPartners(list, "coffee").map((p) => p.id)).toEqual(["s"]);
    expect(filterPartners(list, "ice cream").map((p) => p.id)).toEqual(["d"]);
  });

  it("matches location", () => {
    expect(filterPartners(list, "narragansett").map((p) => p.id)).toEqual(["d", "s"]);
  });

  it("requires every term to match", () => {
    expect(filterPartners(list, "coffee chicken")).toEqual([]);
    expect(filterPartners(list, "pizza")).toEqual([]);
  });
});

describe("partner links", () => {
  it("uses an explicit directions URL first", () => {
    expect(partnerDirectionsUrl(partner({ directionsUrl: "https://maps.test/x", address: "1 St" }))).toBe(
      "https://maps.test/x",
    );
  });

  it("builds a maps search from name + address", () => {
    const url = partnerDirectionsUrl(partner({ name: "Cafe", address: "1 Main St, Kingston, RI" }));
    expect(url).toBe(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent("Cafe, 1 Main St, Kingston, RI")}`,
    );
  });

  it("returns null with no location", () => {
    expect(partnerDirectionsUrl(partner())).toBeNull();
  });

  it("prefers menu over website and hides the action when neither exists", () => {
    expect(partnerPrimaryLink(partner({ menuUrl: "https://m.test", websiteUrl: "https://w.test" }))).toEqual({
      label: "Menu",
      href: "https://m.test",
    });
    expect(partnerPrimaryLink(partner({ websiteUrl: "https://w.test" }))?.label).toBe("Website");
    expect(partnerPrimaryLink(partner())).toBeNull();
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
      categories: ["Food", ""],
      description: "desc",
      address: "1 Test St",
      latitude: 41.48,
      longitude: -71.52,
      hours: [],
      partner_since: "2026-10-01",
      offer_type: "standard_offer",
      offer_title: "Offer",
      offer_description: "Offer desc",
      discount_value: "15%",
      quest_title: "Quest",
      quest_description: "Quest desc",
      redemption_instructions: "Show the app",
      starts_at: "2026-10-01T00:00:00Z",
      ends_at: "2026-10-31T00:00:00Z",
      website_url: "https://example.test",
      menu_url: "https://example.test/menu",
      directions_url: null,
      instagram_url: "https://instagram.com/test",
      is_active: true,
    };
    const mapped = mapPartnerRow(row);
    expect(mapped).toMatchObject({
      id: "row-id",
      categories: ["Food"],
      hours: null,
      offerType: "standard_offer",
      discountValue: "15%",
      menuUrl: "https://example.test/menu",
      redemptionInstructions: "Show the app",
    });
    expect(Object.keys(mapped)).toHaveLength(Object.keys(row).length);
    expect(mapPartnerRow({ ...row, offer_type: "bogus" as never }).offerType).toBeNull();
  });
});
