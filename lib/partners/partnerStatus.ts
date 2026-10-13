import { isPartnerOpenNow, parsePartnerHours } from "@/lib/partners/partnerHours";
import {
  PARTNER_FILTER_TAGS,
  PARTNER_OFFER_TYPES,
  type Partner,
  type PartnerFilterTag,
  type PartnerOfferType,
  type PartnerRow,
} from "@/lib/partners/types";

function parseTime(value: string | null): number | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : null;
}

/** Inactive partners are never shown to students. Order is preserved so the data source controls ranking. */
export function visiblePartners(partners: Partner[]): Partner[] {
  return partners.filter((partner) => partner.isActive);
}

/** False before `startsAt` or once `endsAt` has passed (inclusive); unparseable dates are ignored. */
export function isOfferLive(partner: Partner, now: Date = new Date()): boolean {
  const nowMs = now.getTime();
  const start = parseTime(partner.startsAt);
  const end = parseTime(partner.endsAt);
  if (end !== null && end <= nowMs) return false;
  if (start !== null && start > nowMs) return false;
  return true;
}

/**
 * Business-side reward availability. `coming_soon` covers both "no reward configured yet" and
 * "configured but not started" — the UI never fills in an offer that does not exist.
 */
export type PartnerRewardOfferState = "active" | "coming_soon" | "expired" | "unavailable";

export function partnerRewardOfferState(partner: Partner, now: Date = new Date()): PartnerRewardOfferState {
  if (!partner.discountValue && !partner.offerTitle) return "coming_soon";
  const nowMs = now.getTime();
  const end = parseTime(partner.endsAt);
  if (end !== null && end <= nowMs) return "expired";
  const start = parseTime(partner.startsAt);
  if (start !== null && start > nowMs) return "coming_soon";
  if (partner.rewardPaused) return "unavailable";
  return "active";
}

/** A partner only shows a reward once one has actually been configured, is in its window, and is not paused. */
export function partnerHasLiveReward(partner: Partner, now: Date = new Date()): boolean {
  return partnerRewardOfferState(partner, now) === "active";
}

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['\u2018\u2019`]/g, "")
    .replace(/&/g, " and ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Case-insensitive match on name, categories, food type, menu keywords, and address.
 * Every word in the query must match somewhere.
 */
export function filterPartners(partners: Partner[], query: string): Partner[] {
  const terms = normalizeSearchText(query).split(" ").filter(Boolean);
  if (terms.length === 0) return partners;
  return partners.filter((partner) => {
    const haystack = normalizeSearchText(
      [partner.name, ...partner.categories, ...partner.filterTags, ...partner.keywords, partner.address ?? ""].join(
        " ",
      ),
    );
    return terms.every((term) => haystack.includes(term));
  });
}

export const PERKS_FILTERS = [
  { id: "all", label: "All" },
  { id: "open", label: "Open Now" },
  { id: "deals", label: "Student Deals" },
  { id: "food", label: "Food" },
  { id: "coffee", label: "Coffee" },
  { id: "dessert", label: "Dessert" },
] as const;

export type PerksFilterId = (typeof PERKS_FILTERS)[number]["id"];

export function isPerksFilterId(value: unknown): value is PerksFilterId {
  return PERKS_FILTERS.some((filter) => filter.id === value);
}

export function applyPerksFilter(partners: Partner[], filter: PerksFilterId, now: Date = new Date()): Partner[] {
  switch (filter) {
    case "all":
      return partners;
    case "open":
      return partners.filter((partner) => isPartnerOpenNow(partner.hours, now));
    case "deals":
      return partners.filter((partner) => partnerHasLiveReward(partner, now));
    default:
      return partners.filter((partner) => partner.filterTags.includes(filter));
  }
}

export function partnerDirectionsUrl(partner: Partner): string | null {
  if (partner.directionsUrl) return partner.directionsUrl;
  if (partner.latitude !== null && partner.longitude !== null) {
    return `https://www.google.com/maps/search/?api=1&query=${partner.latitude},${partner.longitude}`;
  }
  if (!partner.address) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${partner.name}, ${partner.address}`)}`;
}

/** Card quick action: prefer the menu/ordering page, then the website. */
export function partnerPrimaryLink(partner: Partner): { label: "Menu" | "Website"; href: string } | null {
  if (partner.menuUrl) return { label: "Menu", href: partner.menuUrl };
  if (partner.websiteUrl) return { label: "Website", href: partner.websiteUrl };
  return null;
}

function normalizeOfferType(value: string | null): PartnerOfferType | null {
  return value && (PARTNER_OFFER_TYPES as readonly string[]).includes(value) ? (value as PartnerOfferType) : null;
}

function normalizeFilterTags(value: string[] | null): PartnerFilterTag[] {
  if (!Array.isArray(value)) return [];
  return value.filter((tag): tag is PartnerFilterTag => (PARTNER_FILTER_TAGS as readonly string[]).includes(tag));
}

export function mapPartnerRow(row: PartnerRow): Partner {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    logoUrl: row.logo_url,
    coverImageUrl: row.cover_image_url,
    categories: Array.isArray(row.categories) ? row.categories.filter(Boolean) : [],
    keywords: Array.isArray(row.keywords) ? row.keywords.filter(Boolean) : [],
    filterTags: normalizeFilterTags(row.filter_tags),
    description: row.description,
    address: row.address,
    latitude: row.latitude,
    longitude: row.longitude,
    hours: parsePartnerHours(row.hours),
    partnerSince: row.partner_since,
    offerType: normalizeOfferType(row.offer_type),
    offerTitle: row.offer_title,
    offerDescription: row.offer_description,
    discountValue: row.discount_value,
    rewardTerms: row.reward_terms,
    rewardPaused: row.reward_paused === true,
    questTitle: row.quest_title,
    questDescription: row.quest_description,
    redemptionInstructions: row.redemption_instructions,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    websiteUrl: row.website_url,
    menuUrl: row.menu_url,
    directionsUrl: row.directions_url,
    instagramUrl: row.instagram_url,
    isActive: row.is_active,
  };
}
