import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  canCreateOffer,
  canManageListing,
  canRespondToOffer,
  centsToPriceLabel,
  findProhibitedMarketplaceReason,
  findUnsafeMeetupReason,
  listingSupportsOffers,
  listingVisibleInDiscovery,
  mapMarketplaceReportToContentReason,
  marketplaceCategoryForFilter,
  marketplaceListingContextLine,
  validateMarketplaceListingCopy,
} from "@/lib/marketplace/policy";
import { createMarketplaceListingSchema, createMarketplaceOfferSchema, createStudentBusinessSchema } from "@/lib/marketplace/schemas";
import { QUAD_FEED_OPTIONS, isMarketFeedTab, isQuadFeedTab } from "@/lib/client/quadFeedOptions";
import { readQuadFeedTabSession, writeQuadFeedTabSession } from "@/lib/client/quadFeedTabSession";

describe("The Market feed selector", () => {
  it("places The Market directly below Organizations", () => {
    expect(QUAD_FEED_OPTIONS.map((row) => row.tab)).toEqual([
      "public",
      "trending",
      "friends",
      "student_organizations",
      "market",
      "greek_life",
      "athletics",
    ]);
    expect(QUAD_FEED_OPTIONS.find((row) => row.tab === "market")?.label).toBe("The Market");
    expect(QUAD_FEED_OPTIONS.find((row) => row.tab === "market")?.hint).toContain("Student businesses");
    expect(isMarketFeedTab("market")).toBe(true);
    expect(isMarketFeedTab("public")).toBe(false);
    expect(isQuadFeedTab("market")).toBe(true);
    expect(isQuadFeedTab("campus")).toBe(false);
  });

  it("persists the selected feed across refresh", () => {
    const store: Record<string, string> = {};
    const sessionStorage = {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
    };
    Object.defineProperty(globalThis, "sessionStorage", { value: sessionStorage, configurable: true });
    writeQuadFeedTabSession("market");
    expect(readQuadFeedTabSession()).toBe("market");
    writeQuadFeedTabSession("friends");
    expect(readQuadFeedTabSession()).toBe("friends");
  });
});

describe("marketplace policy", () => {
  it("rejects prohibited and unsafe listings", () => {
    expect(findProhibitedMarketplaceReason("selling a gun")).toMatch(/weapons/i);
    expect(findProhibitedMarketplaceReason("weed gummies")).toMatch(/illegal/i);
    expect(findUnsafeMeetupReason("Meet in room 204")).toMatch(/meetup/i);
    expect(validateMarketplaceListingCopy({ title: "URI hoodie", description: "Like new" })).toBeNull();
    expect(validateMarketplaceListingCopy({ title: "beer pong set", description: "alcohol included" })).not.toBeNull();
  });

  it("keeps sold listings out of discovery and isolates Student-Owned", () => {
    expect(listingVisibleInDiscovery({ status: "active" })).toBe(true);
    expect(listingVisibleInDiscovery({ status: "sold", soldAt: new Date().toISOString() })).toBe(false);
    expect(listingVisibleInDiscovery({ status: "pending" })).toBe(false);
    expect(marketplaceCategoryForFilter("student_owned")).toBeNull();
    expect(marketplaceCategoryForFilter("clothing")).toBe("clothing");
    expect(marketplaceCategoryForFilter("free")).toBe("free");
  });

  it("authorizes listing edits, offers, and seller-only responses", () => {
    expect(canManageListing({ sellerId: "a", actorId: "a" })).toBe(true);
    expect(canManageListing({ sellerId: "a", actorId: "b" })).toBe(false);
    expect(canManageListing({ sellerId: "a", actorId: "b", businessMember: true })).toBe(true);
    expect(canCreateOffer({ sellerId: "a", buyerId: "a", status: "active" })).toBe(false);
    expect(canCreateOffer({ sellerId: "a", buyerId: "b", status: "active" })).toBe(true);
    expect(canCreateOffer({ sellerId: "a", buyerId: "b", status: "sold" })).toBe(false);
    expect(canRespondToOffer({ sellerId: "a", actorId: "b" })).toBe(false);
    expect(canRespondToOffer({ sellerId: "a", actorId: "a" })).toBe(true);
    expect(
      listingSupportsOffers({
        sellerId: "a",
        buyerId: "b",
        status: "active",
        listingKind: "business_post",
        priceCents: 3000,
      }),
    ).toBe(false);
  });

  it("builds marketplace message context without processing payments", () => {
    expect(marketplaceListingContextLine("Vintage URI Crewneck", 3500)).toBe("Vintage URI Crewneck — $35");
    expect(centsToPriceLabel(0)).toBe("Free");
    expect(mapMarketplaceReportToContentReason("scam")).toBe("spam");
    expect(mapMarketplaceReportToContentReason("prohibited_item")).toBe("restricted_content");
  });
});

describe("marketplace schemas", () => {
  it("creates a personal item listing without a business", () => {
    const parsed = createMarketplaceListingSchema.parse({
      listingKind: "item",
      title: "Vintage URI Crewneck",
      description: "Like new",
      priceDollars: 35,
      category: "clothing",
      condition: "like_new",
      meetupArea: "memorial_union",
      photoUrls: ["https://example.com/crewneck.jpg"],
    });
    expect(parsed.businessId ?? null).toBeNull();
  });

  it("rejects unauthorized offer amounts and accepts business creation", () => {
    expect(createMarketplaceOfferSchema.safeParse({ amountDollars: 0 }).success).toBe(false);
    expect(createMarketplaceOfferSchema.parse({ amountDollars: 28 }).amountDollars).toBe(28);
    const business = createStudentBusinessSchema.parse({
      name: "Rhody Vintage",
      handle: "rhodyvintage",
      category: "clothing",
      offering: "products",
      bio: "Campus vintage.",
      confirmStudentOwned: true,
    });
    expect(business.confirmStudentOwned).toBe(true);
  });
});

describe("marketplace source contracts", () => {
  const root = process.cwd();
  const selector = readFileSync(join(root, "components/QuadFeedSelector.tsx"), "utf8");
  const quad = readFileSync(join(root, "components/TheQuad.tsx"), "utf8");
  const fab = readFileSync(join(root, "components/QuadCreatePostFab.tsx"), "utf8");
  const feed = readFileSync(join(root, "components/market/TheMarketFeed.tsx"), "utf8");
  const card = readFileSync(join(root, "components/market/MarketListingCard.tsx"), "utf8");
  const migration = readFileSync(join(root, "supabase/migrations/20260825180000_campusquest_marketplace.sql"), "utf8");
  const server = readFileSync(join(root, "lib/server/marketplace.ts"), "utf8");
  const css = readFileSync(join(root, "app/globals.css"), "utf8");

  it("selects The Market without using the Quad composer", () => {
    expect(selector).toContain("QUAD_FEED_OPTIONS");
    expect(quad).toContain("TheMarketFeed");
    expect(quad).toContain("isMarketFeedTab");
    expect(fab).toContain('feedTab === "market"');
    expect(fab).toContain("Sell on The Market");
    expect(fab).toContain("onMarketSell");
  });

  it("renders empty state, Student-Owned distinction, and mobile-safe Market chrome", () => {
    expect(feed).toContain("The Market is opening.");
    expect(feed).toContain("Sell Something");
    expect(feed).toContain("Start a Student Business");
    expect(card).toContain("Student-Owned");
    expect(card).toContain("Make Offer");
    expect(css).toContain("env(safe-area-inset-bottom");
    expect(css).toContain("font-size: 16px");
    expect(css).toContain("cq-market-rail");
  });

  it("creates dedicated marketplace tables with ownership RLS", () => {
    for (const table of [
      "marketplace_listings",
      "marketplace_listing_media",
      "marketplace_favorites",
      "marketplace_offers",
      "student_businesses",
      "student_business_members",
      "marketplace_business_follows",
    ]) {
      expect(migration).toContain(`create table if not exists public.${table}`);
    }
    expect(migration).toContain("auth.uid() = seller_id");
    expect(migration).toContain("auth.uid() = buyer_id");
    expect(migration).toContain("prevent_marketplace_verification_spoof");
    expect(migration).toContain("enforce_marketplace_listing_identity");
    expect(migration).toContain("enforce_marketplace_offer_update");
    expect(migration).toContain("buyers may only withdraw their own offers");
    expect(server).toContain("You can only edit your own listings.");
    expect(server).toContain("Only the seller can respond to this offer.");
    expect(server).toContain("marketplaceListingId");
    expect(server).toContain("createContentReport");
  });
});
