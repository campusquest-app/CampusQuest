/**
 * Canonical slugs for organization creation requests (student-facing + API).
 * Labels are the student-readable names shown in UI.
 */
export const ORGANIZATION_REQUEST_CATEGORIES = [
  "academic",
  "professional",
  "cultural",
  "sports",
  "gaming",
  "technology",
  "wellness",
  "arts",
  "community_service",
  "social",
  "greek_life",
  "religious",
  "entrepreneurship",
  "stem",
  "other",
] as const;

export type OrganizationRequestCategory = (typeof ORGANIZATION_REQUEST_CATEGORIES)[number];

export const ORGANIZATION_REQUEST_CATEGORY_LABELS: Record<OrganizationRequestCategory, string> = {
  academic: "Academic",
  professional: "Professional",
  cultural: "Cultural",
  sports: "Sports",
  gaming: "Gaming",
  technology: "Technology",
  wellness: "Wellness",
  arts: "Arts",
  community_service: "Community Service",
  social: "Social",
  greek_life: "Greek Life",
  religious: "Religious",
  entrepreneurship: "Entrepreneurship",
  stem: "STEM",
  other: "Other",
};

/** Slugs from before the 2026 category refresh — shown in admin / org lists for historical rows. */
const LEGACY_ORGANIZATION_REQUEST_CATEGORY_LABELS: Record<string, string> = {
  service: "Service / volunteering (legacy)",
  hobby_special_interest: "Hobby / special interest (legacy)",
};

/** Readable label for a stored request/org category slug (current, legacy, or unknown). */
export function organizationRequestCategoryLabel(category: string): string {
  const current = (ORGANIZATION_REQUEST_CATEGORY_LABELS as Record<string, string>)[category];
  if (current) return current;
  return LEGACY_ORGANIZATION_REQUEST_CATEGORY_LABELS[category] ?? category;
}
