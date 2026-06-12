/**
 * URInvolved-style browse filters for the Organizations tab.
 * Buckets classify both CampusQuest orgs (category slugs) and synced
 * URInvolved orgs (free-text category + tags) — display/filtering only.
 */

export const ORG_BROWSE_FILTERS = [
  { id: "all", label: "All Organizations" },
  { id: "academic_professional", label: "Academic / Professional" },
  { id: "club_sports", label: "Club Sports" },
  { id: "cultural_identity", label: "Cultural / Identity" },
  { id: "fsl", label: "Fraternity & Sorority Life" },
  { id: "honor_societies", label: "Honor Societies" },
  { id: "media_publications", label: "Media / Publications" },
  { id: "performance_arts", label: "Performance / Arts" },
  { id: "political_advocacy", label: "Political / Advocacy" },
  { id: "service_volunteer", label: "Service / Volunteer" },
  { id: "spiritual_religious", label: "Spiritual / Religious" },
  { id: "student_government", label: "Student Government" },
  { id: "other", label: "Other" },
] as const;

export type OrgBrowseFilterId = (typeof ORG_BROWSE_FILTERS)[number]["id"];

export function orgBrowseFilterLabel(id: OrgBrowseFilterId): string {
  return ORG_BROWSE_FILTERS.find((f) => f.id === id)?.label ?? "Other";
}

/** CampusQuest org category slugs → browse buckets. */
const CAMPUS_SLUG_BUCKETS: Record<string, OrgBrowseFilterId> = {
  academic: "academic_professional",
  professional: "academic_professional",
  stem: "academic_professional",
  technology: "academic_professional",
  entrepreneurship: "academic_professional",
  sports: "club_sports",
  cultural: "cultural_identity",
  greek_life: "fsl",
  arts: "performance_arts",
  community_service: "service_volunteer",
  service: "service_volunteer",
  religious: "spiritual_religious",
};

/** Keyword rules for free-text URInvolved categories/tags — order matters (most specific first). */
const KEYWORD_RULES: Array<{ bucket: OrgBrowseFilterId; pattern: RegExp }> = [
  { bucket: "student_government", pattern: /student government|student senate|\bsga\b/ },
  { bucket: "fsl", pattern: /fraternit|soror|greek/ },
  { bucket: "honor_societies", pattern: /honor/ },
  { bucket: "media_publications", pattern: /media|publication|newspaper|radio|magazine|journalis|broadcast|yearbook/ },
  { bucket: "club_sports", pattern: /sport|athletic|intramural|rugby|soccer|hockey|lacrosse|volleyball|sailing|equestrian|fencing|climbing|rowing|crew\b|cheer|esports/ },
  {
    bucket: "performance_arts",
    pattern: /performance|performing|dance|music|theat|band|choir|a ?cappella|improv|orchestra|\barts?\b|comedy|film/,
  },
  { bucket: "political_advocacy", pattern: /politic|advocac|activis|democrat|republican|libertarian|amnesty/ },
  { bucket: "service_volunteer", pattern: /service|volunteer|philanthrop|habitat|relief|outreach/ },
  {
    bucket: "spiritual_religious",
    pattern: /spiritual|religio|faith|ministr|christian|catholic|jewish|hillel|muslim|islam|bible|gospel|church|hindu|buddhis/,
  },
  {
    bucket: "cultural_identity",
    pattern: /cultur|identity|international|multicultural|heritage|latin|asian|african|caribbean|lgbt|pride|hispanic|indigenous/,
  },
  {
    bucket: "academic_professional",
    pattern:
      /academ|professional|career|business|engineer|science|math|pre-?law|pre-?med|pre-?health|nursing|pharma|comput|research|econom|finance|account|market|biolog|chemis|physic|psycholog|education|history|kinesiolog|data|robot/,
  },
];

export function classifyOrganizationBucket(input: {
  /** CampusQuest category slug, when the org is campus-created. */
  campusCategorySlug?: string | null;
  /** Free-text category (URInvolved) or readable label. */
  category?: string | null;
  tags?: string[];
  name?: string;
}): OrgBrowseFilterId {
  const slug = input.campusCategorySlug?.trim().toLowerCase();
  if (slug && CAMPUS_SLUG_BUCKETS[slug]) return CAMPUS_SLUG_BUCKETS[slug];

  const haystack = [input.category ?? "", ...(input.tags ?? []), input.name ?? ""]
    .join(" ")
    .toLowerCase();
  if (haystack.trim()) {
    for (const rule of KEYWORD_RULES) {
      if (rule.pattern.test(haystack)) return rule.bucket;
    }
  }
  return "other";
}
