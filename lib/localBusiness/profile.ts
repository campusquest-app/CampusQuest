import { everyDay, DEFAULT_PARTNER_TIME_ZONE } from "@/lib/partners/partnerHours";
import { partnerHasLiveReward } from "@/lib/partners/partnerStatus";
import type { Partner, PartnerHours } from "@/lib/partners/types";

export type PartnerProfileOverride = {
  username?: string | null;
  description?: string | null;
  websiteUrl?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  hours?: PartnerHours | null;
  logoUrl?: string | null;
  coverImageUrl?: string | null;
  photos?: string[];
};

/** Feed card identity for a post that belongs to one Student Perks listing. */
export function businessPostFields(
  partner: Partner,
  override?: { username?: string | null; logoUrl?: string | null } | null,
) {
  const username = override?.username?.trim() || partner.slug.replace(/-/g, "").slice(0, 24);
  return {
    posted_as_display_name: partner.name,
    posted_as_username: username,
    posted_as_avatar_url: override?.logoUrl || partner.logoUrl,
    posted_as_verified: partner.listingType === "partner",
  };
}

/** Directory listing plus owner edits. Null override fields keep the Student Perks listing. */
export function mergePartnerProfile(partner: Partner, override: PartnerProfileOverride | null | undefined): Partner {
  if (!override) return partner;
  return {
    ...partner,
    description: override.description ?? partner.description,
    websiteUrl: override.websiteUrl ?? partner.websiteUrl,
    logoUrl: override.logoUrl ?? partner.logoUrl,
    coverImageUrl: override.coverImageUrl ?? partner.coverImageUrl,
    hours: override.hours ?? partner.hours,
  };
}

export function activeOfferCount(partner: Partner, now = new Date()): number {
  return partnerHasLiveReward(partner, now) ? 1 : 0;
}

const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Same-hours-every-day editor. Blank values leave the listing hours untouched. */
export function weeklyHoursFromEditor(open: string, close: string): PartnerHours | null {
  const start = open.trim();
  const end = close.trim();
  if (!start && !end) return null;
  if (!CLOCK.test(start) || !CLOCK.test(end) || start === end) return null;
  return {
    timeZone: DEFAULT_PARTNER_TIME_ZONE,
    weekly: everyDay({ open: start, close: end }),
    source: "Updated by the business",
    checkedOn: new Date().toISOString().slice(0, 10),
  };
}
