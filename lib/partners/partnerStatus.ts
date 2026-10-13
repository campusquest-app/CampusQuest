import { PARTNER_OFFER_TYPES, type Partner, type PartnerOfferType, type PartnerRow } from "@/lib/partners/types";

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

/** A partner only shows a reward once one has actually been configured and is inside its window. */
export function partnerHasLiveReward(partner: Partner, now: Date = new Date()): boolean {
  return Boolean(partner.discountValue || partner.offerTitle) && isOfferLive(partner, now);
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

/** Case-insensitive match on name, categories, and address. Every word in the query must match somewhere. */
export function filterPartners(partners: Partner[], query: string): Partner[] {
  const terms = normalizeSearchText(query).split(" ").filter(Boolean);
  if (terms.length === 0) return partners;
  return partners.filter((partner) => {
    const haystack = normalizeSearchText(
      [partner.name, ...partner.categories, partner.address ?? ""].join(" "),
    );
    return terms.every((term) => haystack.includes(term));
  });
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

export function mapPartnerRow(row: PartnerRow): Partner {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    logoUrl: row.logo_url,
    coverImageUrl: row.cover_image_url,
    categories: Array.isArray(row.categories) ? row.categories.filter(Boolean) : [],
    description: row.description,
    address: row.address,
    latitude: row.latitude,
    longitude: row.longitude,
    hours: Array.isArray(row.hours) && row.hours.length > 0 ? row.hours : null,
    partnerSince: row.partner_since,
    offerType: normalizeOfferType(row.offer_type),
    offerTitle: row.offer_title,
    offerDescription: row.offer_description,
    discountValue: row.discount_value,
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
