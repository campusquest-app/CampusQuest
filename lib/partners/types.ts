/**
 * CampusQuest Partners: local businesses with an official CampusQuest partnership.
 * Keep this module free of server/client-only imports so it can be shared and unit tested.
 */

export const PARTNER_OFFER_TYPES = [
  "standard_offer",
  "partner_quest",
  "campusquest_day",
  "special_promotion",
] as const;

export type PartnerOfferType = (typeof PARTNER_OFFER_TYPES)[number];

/** Database row shape (snake_case), one row per partner + current offer. */
export type PartnerRow = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  cover_image_url: string | null;
  category: string | null;
  description: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
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
  instagram_url: string | null;
  is_active: boolean;
  is_featured: boolean;
  is_campusquest_day: boolean;
};

export type Partner = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  coverImageUrl: string | null;
  category: string | null;
  description: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  partnerSince: string | null;
  offerType: PartnerOfferType | null;
  offerTitle: string | null;
  offerDescription: string | null;
  /** Free text so it can hold "15% off" or "Free drink with any sandwich". */
  discountValue: string | null;
  questTitle: string | null;
  questDescription: string | null;
  redemptionInstructions: string | null;
  startsAt: string | null;
  endsAt: string | null;
  websiteUrl: string | null;
  instagramUrl: string | null;
  isActive: boolean;
  isFeatured: boolean;
  isCampusQuestDay: boolean;
};

export type PartnersResponse = { partners: Partner[] };
