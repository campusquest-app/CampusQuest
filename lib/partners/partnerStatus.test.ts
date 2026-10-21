import { describe, expect, it } from "vitest";
import { definePartner } from "@/lib/partners/partnerDirectory";
import { everyDay } from "@/lib/partners/partnerHours";
import {
  applyPerksFilter,
  filterPartners,
  PERKS_FILTERS,
  partnerHasQuestOffer,
  partnerRewardCtaLabel,
  partnerRewardOfferState,
  partnerRewardSectionLabel,
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

  it("matches food type and menu keywords", () => {
    const withKeywords = [
      { ...daisys, filterTags: ["food" as const, "dessert" as const], keywords: ["tenders", "wings"] },
      { ...sandbar, filterTags: ["coffee" as const], keywords: ["latte", "cold brew"] },
    ];
    expect(filterPartners(withKeywords, "latte").map((p) => p.id)).toEqual(["s"]);
    expect(filterPartners(withKeywords, "cold brew").map((p) => p.id)).toEqual(["s"]);
    expect(filterPartners(withKeywords, "dessert").map((p) => p.id)).toEqual(["d"]);
    expect(filterPartners(withKeywords, "tenders").map((p) => p.id)).toEqual(["d"]);
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
      listing_type: "partner",
      logo_url: "https://cdn.test/logo.png",
      cover_image_url: "https://cdn.test/cover.png",
      categories: ["Food", ""],
      keywords: ["latte", ""],
      filter_tags: ["coffee", "pizza"],
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
      reward_terms: null,
      reward_paused: null,
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
      listingType: "partner",
      categories: ["Food"],
      keywords: ["latte"],
      filterTags: ["coffee"],
      hours: null,
      rewardPaused: false,
      offerType: "standard_offer",
      discountValue: "15%",
      menuUrl: "https://example.test/menu",
      redemptionInstructions: "Show the app",
    });
    expect(Object.keys(mapped)).toHaveLength(Object.keys(row).length);
    expect(mapPartnerRow({ ...row, offer_type: "bogus" as never }).offerType).toBeNull();
    expect(mapPartnerRow({ ...row, listing_type: null }).listingType).toBe("partner");
    expect(mapPartnerRow({ ...row, listing_type: "free_local_business" }).listingType).toBe("free_local_business");
  });

  it("parses structured hours JSON and drops malformed hours", () => {
    const hoursRow: PartnerRow = {
      id: "r",
      name: "R",
      slug: "r",
      listing_type: null,
      logo_url: null,
      cover_image_url: null,
      categories: null,
      keywords: null,
      filter_tags: null,
      description: null,
      address: null,
      latitude: null,
      longitude: null,
      hours: { timeZone: "America/New_York", weekly: everyDay({ open: "07:00", close: "12:00" }) },
      partner_since: null,
      offer_type: null,
      offer_title: null,
      offer_description: null,
      discount_value: null,
      reward_terms: null,
      reward_paused: true,
      quest_title: null,
      quest_description: null,
      redemption_instructions: null,
      starts_at: null,
      ends_at: null,
      website_url: null,
      menu_url: null,
      directions_url: null,
      instagram_url: null,
      is_active: true,
    };
    const base = mapPartnerRow(hoursRow);
    expect(base.hours?.weekly).toHaveLength(7);
    expect(base.rewardPaused).toBe(true);
    expect(mapPartnerRow({ ...hoursRow, hours: ["Mon 9-5"] }).hours).toBeNull();
  });
});

describe("partnerRewardOfferState", () => {
  it("is coming soon when no reward is configured", () => {
    expect(partnerRewardOfferState(partner(), NOW)).toBe("coming_soon");
  });

  it("is none for free local business listings even if offer fields were set by mistake", () => {
    expect(
      partnerRewardOfferState(
        partner({ listingType: "free_local_business", discountValue: "20% OFF", offerTitle: "Nope" }),
        NOW,
      ),
    ).toBe("none");
    expect(partnerHasLiveReward(partner({ listingType: "free_local_business", discountValue: "20% OFF" }), NOW)).toBe(
      false,
    );
  });

  it("is active, expired, scheduled, or paused based on the configured window", () => {
    const reward = { discountValue: "20% OFF" };
    expect(partnerRewardOfferState(partner(reward), NOW)).toBe("active");
    expect(partnerRewardOfferState(partner({ ...reward, endsAt: "2026-10-01T00:00:00Z" }), NOW)).toBe("expired");
    expect(partnerRewardOfferState(partner({ ...reward, startsAt: "2026-11-01T00:00:00Z" }), NOW)).toBe("coming_soon");
    expect(partnerRewardOfferState(partner({ ...reward, rewardPaused: true }), NOW)).toBe("unavailable");
    expect(partnerHasLiveReward(partner({ ...reward, rewardPaused: true }), NOW)).toBe(false);
  });
});

describe("applyPerksFilter", () => {
  const openAllDay = { timeZone: "America/New_York", weekly: everyDay({ open: "00:00", close: "24:00" }) };
  const closedAllWeek = { timeZone: "America/New_York", weekly: everyDay() };
  const list = [
    partner({ id: "food", filterTags: ["food", "dessert"], discountValue: "20% OFF", hours: openAllDay }),
    partner({ id: "coffee", filterTags: ["coffee"], hours: closedAllWeek }),
    partner({ id: "unknown", filterTags: ["food"], hours: null }),
  ];

  it("filters by open now using live hours and never treats unknown hours as open", () => {
    expect(applyPerksFilter(list, "open", NOW).map((p) => p.id)).toEqual(["food"]);
  });

  it("filters by student deals and category chips", () => {
    expect(applyPerksFilter(list, "deals", NOW).map((p) => p.id)).toEqual(["food"]);
    expect(applyPerksFilter(list, "food", NOW).map((p) => p.id)).toEqual(["food", "unknown"]);
    expect(applyPerksFilter(list, "coffee", NOW).map((p) => p.id)).toEqual(["coffee"]);
    expect(applyPerksFilter(list, "dessert", NOW).map((p) => p.id)).toEqual(["food"]);
    expect(applyPerksFilter(list, "all", NOW)).toHaveLength(3);
  });

  it("exposes exactly the six requested chips in order", () => {
    expect(PERKS_FILTERS.map((f) => f.label)).toEqual(["All", "Open Now", "Student Deals", "Food", "Coffee", "Dessert"]);
  });
});

describe("partner reward CTA labels", () => {
  it("says View Deal for standard offers and View Quest only for quest offers", () => {
    expect(partnerRewardCtaLabel(partner({ offerType: "standard_offer" }))).toBe("View Deal");
    expect(partnerRewardCtaLabel(partner({ offerType: "special_promotion" }))).toBe("View Deal");
    expect(partnerRewardCtaLabel(partner({ offerType: "partner_quest" }))).toBe("View Quest");
    expect(partnerRewardCtaLabel(partner({ questTitle: "Campus walk" }))).toBe("View Quest");
    expect(partnerHasQuestOffer(partner({ offerType: "standard_offer" }))).toBe(false);
    expect(partnerRewardSectionLabel(partner({ offerType: "standard_offer" }))).toBe("Student deal");
    expect(partnerRewardSectionLabel(partner({ offerType: "partner_quest" }))).toBe("Student quest");
  });
});

describe("filterPartners deal fields", () => {
  it("matches offer titles and discount copy without inventing results", () => {
    const list = [
      partner({ id: "d", name: "Daisy", offerTitle: "Go on a quest for 20% OFF", discountValue: "20% OFF" }),
      partner({ id: "s", name: "Sandbar", offerTitle: null, discountValue: null }),
    ];
    expect(filterPartners(list, "20%").map((p) => p.id)).toEqual(["d"]);
    expect(filterPartners(list, "quest for").map((p) => p.id)).toEqual(["d"]);
    expect(filterPartners(list, "pizza")).toEqual([]);
  });
});
