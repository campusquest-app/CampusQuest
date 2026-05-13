export const ORGANIZATION_REQUEST_CATEGORIES = [
  "academic",
  "cultural",
  "sports",
  "service",
  "greek_life",
  "religious",
  "professional",
  "hobby_special_interest",
  "other",
] as const;

export type OrganizationRequestCategory = (typeof ORGANIZATION_REQUEST_CATEGORIES)[number];

export const ORGANIZATION_REQUEST_CATEGORY_LABELS: Record<OrganizationRequestCategory, string> = {
  academic: "Academic / Honor society",
  cultural: "Cultural / identity",
  sports: "Sports / recreation",
  service: "Service / volunteering",
  greek_life: "Fraternity / sorority (Greek life)",
  religious: "Faith / spirituality",
  professional: "Career / professional",
  hobby_special_interest: "Hobby / special interest",
  other: "Other",
};
