import { PARTNER_OFFER_TYPES, type Partner, type PartnerOfferType, type PartnerRow } from "@/lib/partners/types";

export type PartnerDisplayState = "active" | "upcoming" | "expired" | "inactive";

function parseTime(value: string | null): number | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : null;
}

export function derivePartnerDisplayState(partner: Partner, now: Date = new Date()): PartnerDisplayState {
  if (!partner.isActive) return "inactive";
  const nowMs = now.getTime();
  const start = parseTime(partner.startsAt);
  const end = parseTime(partner.endsAt);
  if (end !== null && end <= nowMs) return "expired";
  if (start !== null && start > nowMs) return "upcoming";
  return "active";
}

export type PartnerSections = {
  featured: Partner[];
  active: Partner[];
  expired: Partner[];
};

/** Inactive and not-yet-started partners are never shown to students. */
export function groupPartnersForDisplay(partners: Partner[], now: Date = new Date()): PartnerSections {
  const sections: PartnerSections = { featured: [], active: [], expired: [] };
  for (const partner of partners) {
    const state = derivePartnerDisplayState(partner, now);
    if (state === "active") {
      (partner.isFeatured ? sections.featured : sections.active).push(partner);
    } else if (state === "expired") {
      sections.expired.push(partner);
    }
  }
  return sections;
}

export function hasVisiblePartners(sections: PartnerSections): boolean {
  return sections.featured.length + sections.active.length + sections.expired.length > 0;
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
    category: row.category,
    description: row.description,
    address: row.address,
    latitude: row.latitude,
    longitude: row.longitude,
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
    instagramUrl: row.instagram_url,
    isActive: row.is_active,
    isFeatured: row.is_featured,
    isCampusQuestDay: row.is_campusquest_day,
  };
}
