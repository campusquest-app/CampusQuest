import { DEFAULT_PARTNER_TIME_ZONE, everyDay } from "@/lib/partners/partnerHours";
import type { Partner } from "@/lib/partners/types";

type PartnerInput = Pick<Partner, "id" | "name" | "slug"> & Partial<Omit<Partner, "id" | "name" | "slug">>;

/** Fills every optional field with "not provided" so entries only list what the business has confirmed. */
export function definePartner(input: PartnerInput): Partner {
  return {
    listingType: "partner",
    logoUrl: null,
    coverImageUrl: null,
    categories: [],
    keywords: [],
    filterTags: [],
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
    rewardTerms: null,
    rewardPaused: false,
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
 * Local businesses shown in Community Quests, in display order.
 * Includes official partners (with optional student rewards) and free local business listings.
 * Images must be the business's own assets (website, ordering page, or files they send us) stored under
 * /public/partners/<slug>/ — never generated or stock imagery. Hours must come from the business's own
 * published listing (record `source` + `checkedOn`); leave hours and rewards null until confirmed.
 * Free listings must not set discount, offer, redemption, or partnerSince fields.
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
    keywords: ["chicken sandwich", "tenders", "wings", "fries", "Warwick ice cream", "dessert"],
    filterTags: ["food", "dessert"],
    description:
      "Grilled and fried chicken sandwiches, tenders, and Warwick ice cream on Point Judith Road in Narragansett.",
    address: "106 Point Judith Rd, Narragansett, RI",
    hours: {
      timeZone: DEFAULT_PARTNER_TIME_ZONE,
      weekly: everyDay({ open: "12:00", close: "22:00" }),
      source: "Daisy\u2019s website (\u201cOpen everyday 12\u201310 P.M.\u201d)",
      checkedOn: "2026-10-12",
    },
    offerType: "standard_offer",
    discountValue: "20% OFF",
    offerTitle: "Go on a quest for 20% OFF at Daisy\u2019s",
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
    keywords: ["latte", "cold brew", "espresso", "matcha", "chai", "bagel", "breakfast sandwich", "lemonade"],
    filterTags: ["coffee", "food"],
    description:
      "Coffee shop serving signature lattes, cold brew, refreshers, and breakfast sandwiches on Point Judith Road.",
    address: "106 Point Judith Rd, Narragansett, RI",
    hours: {
      timeZone: DEFAULT_PARTNER_TIME_ZONE,
      weekly: everyDay({ open: "07:00", close: "12:00" }),
      source: "The Sandbar Cafe\u2019s Toast ordering page",
      checkedOn: "2026-10-12",
    },
    menuUrl: "https://order.toasttab.com/online/the-sandbar-cafe-106-point-judith-road",
  }),
  definePartner({
    id: "international-pocket-cafe",
    slug: "international-pocket-cafe",
    listingType: "free_local_business",
    name: "International Pocket Caf\u00e9",
    // Logo and cover are from internationalpocketcafe.com (wp-content/uploads).
    logoUrl: "/partners/international-pocket-cafe/logo.png",
    coverImageUrl: "/partners/international-pocket-cafe/cover.jpg",
    categories: ["Food & Dining"],
    keywords: [
      "mediterranean",
      "falafel",
      "gyro",
      "hummus",
      "wraps",
      "shawarma",
      "baklava",
      "middle eastern",
      "kingston",
    ],
    filterTags: ["food"],
    description:
      "Family-owned Mediterranean caf\u00e9 serving authentic Middle Eastern cuisine \u2014 wraps, platters, falafel, and more \u2014 near campus on Fortin Road.",
    address: "99 Fortin Rd, Kingston, RI",
    websiteUrl: "https://internationalpocketcafe.com/",
  }),
];

export function findPartnerById(id: string): Partner | null {
  return PARTNER_DIRECTORY.find((partner) => partner.id === id && partner.isActive) ?? null;
}
