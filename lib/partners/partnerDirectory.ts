import type { Partner } from "@/lib/partners/types";

type PartnerInput = Pick<Partner, "id" | "name" | "slug"> & Partial<Omit<Partner, "id" | "name" | "slug">>;

/** Fills every optional field with "not provided" so entries only list what the business has confirmed. */
export function definePartner(input: PartnerInput): Partner {
  return {
    logoUrl: null,
    coverImageUrl: null,
    categories: [],
    description: null,
    address: null,
    latitude: null,
    longitude: null,
    hours: null,
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
    menuUrl: null,
    directionsUrl: null,
    instagramUrl: null,
    isActive: true,
    ...input,
  };
}

/**
 * Official CampusQuest Partners, in display order.
 * Images must be the business's own assets (website, ordering page, or files they send us) stored under
 * /public/partners/<slug>/ — never generated or stock imagery. Leave hours and rewards null until confirmed.
 */
export const PARTNER_DIRECTORY: Partner[] = [
  definePartner({
    id: "daisys-chicken-ice-cream",
    slug: "daisys-chicken-ice-cream",
    name: "Daisy\u2019s Chicken & Ice Cream",
    // Both images are from daisysnarragansett.com (wp-content/uploads/2025/01).
    coverImageUrl: "/partners/daisys/cover.jpg",
    logoUrl: "/partners/daisys/logo.jpg",
    categories: ["Chicken", "Ice Cream"],
    description:
      "Grilled and fried chicken sandwiches, tenders, and Warwick ice cream on Point Judith Road in Narragansett.",
    address: "106 Point Judith Rd, Narragansett, RI",
    offerType: "standard_offer",
    discountValue: "20% OFF",
    offerTitle: "for URI students",
    redemptionInstructions: "Show your CampusQuest account at checkout.",
    websiteUrl: "https://daisysnarragansett.com/",
  }),
  definePartner({
    id: "the-sandbar-cafe",
    slug: "the-sandbar-cafe",
    name: "The Sandbar Cafe",
    // Logo is the restaurant image published on their Toast ordering page. No photos have been provided yet.
    logoUrl: "/partners/sandbar/logo.png",
    categories: ["Coffee", "Breakfast", "Drinks"],
    description:
      "Coffee shop serving signature lattes, cold brew, refreshers, and breakfast sandwiches on Point Judith Road.",
    address: "106 Point Judith Rd, Narragansett, RI",
    menuUrl: "https://order.toasttab.com/online/the-sandbar-cafe-106-point-judith-road",
  }),
];
