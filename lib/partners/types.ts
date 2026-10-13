/**
 * CampusQuest Partners: local businesses with an official CampusQuest partnership.
 * Keep this module free of server/client-only imports so it can be shared and unit tested.
 */

export const PARTNER_OFFER_TYPES = ["standard_offer", "partner_quest", "special_promotion"] as const;

export type PartnerOfferType = (typeof PARTNER_OFFER_TYPES)[number];

/** Database row shape (snake_case), one row per partner + current offer. */
export type PartnerRow = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  cover_image_url: string | null;
  categories: string[] | null;
  description: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  hours: string[] | null;
  partner_since: string | null;
  offer_type: PartnerOfferType | null;
  offer_title: string | null;
  offer_description: string | null;
  discount_value: string | null;
  quest_title: string | null;
  quest_description: string | null;
  redemption_instructions: string | null;
  starts_at: string | null;
  ends_at: string | null;
  website_url: string | null;
  menu_url: string | null;
  directions_url: string | null;
  instagram_url: string | null;
  is_active: boolean;
};

export type Partner = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  coverImageUrl: string | null;
  categories: string[];
  description: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  /** Display lines such as "Mon–Fri 7am–2pm". Leave null unless confirmed by the business. */
  hours: string[] | null;
  partnerSince: string | null;
  offerType: PartnerOfferType | null;
  /** Headline under the discount, e.g. "for URI students". */
  offerTitle: string | null;
  offerDescription: string | null;
  /** Free text so it can hold "20% OFF" or "Free drink with any sandwich". */
  discountValue: string | null;
  questTitle: string | null;
  questDescription: string | null;
  redemptionInstructions: string | null;
  /** Optional window for the current offer; the partner stays listed outside it, without the reward. */
  startsAt: string | null;
  endsAt: string | null;
  websiteUrl: string | null;
  menuUrl: string | null;
  /** Falls back to a Maps search built from the name + address when null. */
  directionsUrl: string | null;
  instagramUrl: string | null;
  isActive: boolean;
};

export type PartnersResponse = { partners: Partner[] };
