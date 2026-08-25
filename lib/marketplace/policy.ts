/**
 * Central marketplace policy. Import from client and server so enforcement
 * is not scattered across UI components.
 */

export const MARKETPLACE_LISTING_KINDS = ["item", "service", "business_post"] as const;
export type MarketplaceListingKind = (typeof MARKETPLACE_LISTING_KINDS)[number];

export const MARKETPLACE_LISTING_STATUSES = ["active", "pending", "sold", "removed"] as const;
export type MarketplaceListingStatus = (typeof MARKETPLACE_LISTING_STATUSES)[number];

export const MARKETPLACE_CONDITIONS = ["new", "like_new", "good", "fair", "for_parts"] as const;
export type MarketplaceCondition = (typeof MARKETPLACE_CONDITIONS)[number];

export const MARKETPLACE_CATEGORIES = [
  "clothing",
  "dorm",
  "electronics",
  "textbooks",
  "services",
  "free",
  "other",
] as const;
export type MarketplaceCategory = (typeof MARKETPLACE_CATEGORIES)[number];

export const MARKETPLACE_FEED_FILTERS = [
  "for_you",
  "student_owned",
  "clothing",
  "dorm",
  "electronics",
  "textbooks",
  "services",
  "free",
] as const;
export type MarketplaceFeedFilter = (typeof MARKETPLACE_FEED_FILTERS)[number];

export const MARKETPLACE_MEETUP_AREAS = [
  "memorial_union",
  "library",
  "quad",
  "ryan_center",
  "dining_hall",
  "residence_hall_area",
  "messages",
] as const;
export type MarketplaceMeetupArea = (typeof MARKETPLACE_MEETUP_AREAS)[number];

export const MARKETPLACE_OFFER_STATUSES = ["pending", "accepted", "declined", "withdrawn"] as const;
export type MarketplaceOfferStatus = (typeof MARKETPLACE_OFFER_STATUSES)[number];

export const MARKETPLACE_BUSINESS_OFFERINGS = ["products", "services", "both"] as const;
export type MarketplaceBusinessOffering = (typeof MARKETPLACE_BUSINESS_OFFERINGS)[number];

export const MARKETPLACE_MAX_PHOTOS = 8;
export const MARKETPLACE_TITLE_MAX = 80;
export const MARKETPLACE_DESCRIPTION_MAX = 2000;
export const MARKETPLACE_BIO_MAX = 400;
export const MARKETPLACE_PRICE_MAX_DOLLARS = 10_000;
export const MARKETPLACE_SOLD_DISCOVERY_TTL_MS = 0;

export const MARKETPLACE_CATEGORY_LABELS: Record<MarketplaceCategory, string> = {
  clothing: "Clothing",
  dorm: "Dorm",
  electronics: "Electronics",
  textbooks: "Textbooks",
  services: "Services",
  free: "Free",
  other: "Other",
};

export const MARKETPLACE_FILTER_LABELS: Record<MarketplaceFeedFilter, string> = {
  for_you: "For You",
  student_owned: "Student-Owned",
  clothing: "Clothing",
  dorm: "Dorm",
  electronics: "Electronics",
  textbooks: "Textbooks",
  services: "Services",
  free: "Free",
};

export const MARKETPLACE_CONDITION_LABELS: Record<MarketplaceCondition, string> = {
  new: "New",
  like_new: "Like new",
  good: "Good",
  fair: "Fair",
  for_parts: "For parts",
};

export const MARKETPLACE_MEETUP_LABELS: Record<MarketplaceMeetupArea, string> = {
  memorial_union: "Memorial Union",
  library: "Library",
  quad: "The Quad",
  ryan_center: "Ryan Center",
  dining_hall: "Dining hall",
  residence_hall_area: "Near a residence hall",
  messages: "Arrange in Messages",
};

export const MARKETPLACE_REPORT_REASONS = [
  { value: "scam", label: "Scam", contentReason: "spam" },
  { value: "prohibited_item", label: "Prohibited item", contentReason: "restricted_content" },
  { value: "misleading", label: "Misleading listing", contentReason: "misinformation" },
  { value: "harassment", label: "Harassment", contentReason: "harassment" },
  { value: "counterfeit", label: "Counterfeit", contentReason: "copyright_infringement" },
  { value: "other", label: "Other", contentReason: "other" },
] as const;

export type MarketplaceReportReason = (typeof MARKETPLACE_REPORT_REASONS)[number]["value"];

export const MARKETPLACE_REPORT_REASON_VALUES = MARKETPLACE_REPORT_REASONS.map((row) => row.value) as [
  MarketplaceReportReason,
  ...MarketplaceReportReason[],
];

const PROHIBITED_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /\b(weapon|gun|firearm|ammunition|ammo|knife|taser|pepper\s*spray)\b/i, label: "weapons" },
  { re: /\b(drug|drugs|weed|marijuana|cannabis|cocaine|mdma|oxycodone|perc|xanax|adderall|vape|nicotine|tobacco|cigarette|alcohol|beer|liquor|fake\s*id)\b/i, label: "age-restricted or illegal goods" },
  { re: /\b(firework|explosive|bomb|hazardous|poison)\b/i, label: "dangerous items" },
  { re: /\b(stolen|counterfeit\s*id|exam\s*answers?|cheat\s*sheet)\b/i, label: "prohibited academic or stolen goods" },
];

const PRECISE_LOCATION_PATTERNS = [
  /\b(room|rm|apt|apartment|suite|unit|#)\s*\d+\b/i,
  /\b\d{1,5}\s+\w+\s+(st|street|ave|avenue|rd|road|ln|lane|dr|drive)\b/i,
];

export function isMarketplaceListingKind(value: string): value is MarketplaceListingKind {
  return (MARKETPLACE_LISTING_KINDS as readonly string[]).includes(value);
}

export function isMarketplaceCategory(value: string): value is MarketplaceCategory {
  return (MARKETPLACE_CATEGORIES as readonly string[]).includes(value);
}

export function isMarketplaceMeetupArea(value: string): value is MarketplaceMeetupArea {
  return (MARKETPLACE_MEETUP_AREAS as readonly string[]).includes(value);
}

export function isMarketplaceFeedFilter(value: string): value is MarketplaceFeedFilter {
  return (MARKETPLACE_FEED_FILTERS as readonly string[]).includes(value);
}

export function dollarsToCents(dollars: number): number {
  if (!Number.isFinite(dollars) || dollars < 0) return 0;
  return Math.round(dollars * 100);
}

export function centsToPriceLabel(cents: number | null | undefined, starting = false): string {
  if (cents == null || cents <= 0) return "Free";
  const dollars = cents / 100;
  const formatted = Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
  return starting ? `Starting at ${formatted}` : formatted;
}

export function findProhibitedMarketplaceReason(text: string): string | null {
  const haystack = text.trim();
  if (!haystack) return null;
  for (const rule of PROHIBITED_PATTERNS) {
    if (rule.re.test(haystack)) return `This listing isn't allowed (${rule.label}).`;
  }
  return null;
}

export function validateMarketplaceListingCopy(args: {
  title: string;
  description: string;
  availabilityNote?: string | null;
}): string | null {
  const combined = `${args.title}\n${args.description}\n${args.availabilityNote ?? ""}`;
  return findProhibitedMarketplaceReason(combined) ?? findUnsafeMeetupReason(combined);
}

export function marketplaceListingContextLine(
  title: string,
  priceCents: number,
  startingPrice = false,
): string {
  return `${title.trim()} — ${centsToPriceLabel(priceCents, startingPrice)}`;
}

export function listingSupportsOffers(args: {
  sellerId: string;
  buyerId: string;
  status: MarketplaceListingStatus;
  listingKind: MarketplaceListingKind;
  priceCents: number;
}): boolean {
  if (args.listingKind === "business_post") return false;
  if (args.priceCents <= 0) return false;
  return canCreateOffer({ sellerId: args.sellerId, buyerId: args.buyerId, status: args.status });
}

export function findUnsafeMeetupReason(text: string): string | null {
  const haystack = text.trim();
  if (!haystack) return null;
  for (const re of PRECISE_LOCATION_PATTERNS) {
    if (re.test(haystack)) {
      return "Use a general public meetup area — not a room number or street address.";
    }
  }
  return null;
}

export function marketplaceCategoryForFilter(filter: MarketplaceFeedFilter): MarketplaceCategory | null {
  if (filter === "for_you" || filter === "student_owned") return null;
  return filter;
}

export function listingVisibleInDiscovery(args: {
  status: MarketplaceListingStatus;
  soldAt?: string | null;
  nowMs?: number;
}): boolean {
  if (args.status === "removed" || args.status === "pending") return false;
  if (args.status === "sold") {
    if (MARKETPLACE_SOLD_DISCOVERY_TTL_MS <= 0) return false;
    if (!args.soldAt) return false;
    const soldMs = Date.parse(args.soldAt);
    if (!Number.isFinite(soldMs)) return false;
    return (args.nowMs ?? Date.now()) - soldMs < MARKETPLACE_SOLD_DISCOVERY_TTL_MS;
  }
  return args.status === "active";
}

export function canManageListing(args: { sellerId: string; businessMember?: boolean; actorId: string }): boolean {
  return args.actorId === args.sellerId || args.businessMember === true;
}

export function canRespondToOffer(args: { sellerId: string; actorId: string }): boolean {
  return args.actorId === args.sellerId;
}

export function canCreateOffer(args: { sellerId: string; buyerId: string; status: MarketplaceListingStatus }): boolean {
  if (args.buyerId === args.sellerId) return false;
  return args.status === "active";
}

export function mapMarketplaceReportToContentReason(
  reason: MarketplaceReportReason,
): (typeof MARKETPLACE_REPORT_REASONS)[number]["contentReason"] {
  return MARKETPLACE_REPORT_REASONS.find((row) => row.value === reason)?.contentReason ?? "other";
}
