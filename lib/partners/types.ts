/**
 * CampusQuest Partners: local businesses with an official CampusQuest partnership.
 * Keep this module free of server/client-only imports so it can be shared and unit tested.
 */

export const PARTNER_OFFER_TYPES = ["standard_offer", "partner_quest", "special_promotion"] as const;

export type PartnerOfferType = (typeof PARTNER_OFFER_TYPES)[number];

export const PARTNER_FILTER_TAGS = ["food", "coffee", "dessert"] as const;

export type PartnerFilterTag = (typeof PARTNER_FILTER_TAGS)[number];

/** 24-hour local wall-clock time, "HH:MM". "24:00" is allowed as a closing time. */
export type PartnerClockTime = string;

/** A close at or before the open time runs past midnight into the next day. */
export type PartnerHoursInterval = { open: PartnerClockTime; close: PartnerClockTime };

/** Replaces the weekly hours for one local date. `closed: true` or no intervals means closed all day. */
export type PartnerSpecialHours = {
  date: string;
  label?: string | null;
  closed?: boolean;
  intervals?: PartnerHoursInterval[];
};

/** Inclusive local-date range where the business is closed regardless of its weekly schedule. */
export type PartnerTemporaryClosure = { from: string; to: string; reason?: string | null };

export type PartnerHours = {
  /** IANA time zone the hours are written in, e.g. "America/New_York". */
  timeZone: string;
  /** Exactly seven entries, Sunday first. An empty array means closed that weekday. */
  weekly: PartnerHoursInterval[][];
  special?: PartnerSpecialHours[];
  closures?: PartnerTemporaryClosure[];
  /** Where the hours were published by the business, shown to students. */
  source?: string | null;
  /** Local date (YYYY-MM-DD) the hours were last confirmed against that source. */
  checkedOn?: string | null;
};

/** Database row shape (snake_case), one row per partner + current offer. */
export type PartnerRow = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  cover_image_url: string | null;
  categories: string[] | null;
  keywords: string[] | null;
  filter_tags: string[] | null;
  description: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  hours: unknown;
  partner_since: string | null;
  offer_type: PartnerOfferType | null;
  offer_title: string | null;
  offer_description: string | null;
  discount_value: string | null;
  reward_terms: string | null;
  reward_paused: boolean | null;
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
  /** Extra search words taken from the business's own menu, e.g. "latte", "tenders". */
  keywords: string[];
  /** Drives the Food / Coffee / Dessert filter chips. */
  filterTags: PartnerFilterTag[];
  description: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  /** Structured opening hours. Leave null unless published or confirmed by the business. */
  hours: PartnerHours | null;
  partnerSince: string | null;
  offerType: PartnerOfferType | null;
  /** Headline under the discount, e.g. "Go on a quest for 20% OFF at Daisy's". */
  offerTitle: string | null;
  offerDescription: string | null;
  /** Free text so it can hold "20% OFF" or "Free drink with any sandwich". */
  discountValue: string | null;
  /** Fine print agreed with the business. Never filled in without their confirmation. */
  rewardTerms: string | null;
  /** Business asked to pause the reward for now; the offer shows as temporarily unavailable. */
  rewardPaused: boolean;
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
