/**
 * Canonical onboarding taxonomies for CampusQuest.
 * Store stable IDs — never display strings alone.
 */

export const ONBOARDING_VERSION = 2 as const;

export const STUDENT_STATUS = {
  current_or_incoming: "current_or_incoming",
  not_student: "not_student",
} as const;

export type StudentStatusId = (typeof STUDENT_STATUS)[keyof typeof STUDENT_STATUS];

export const STUDENT_STATUS_OPTIONS: Array<{ id: StudentStatusId; label: string }> = [
  { id: "current_or_incoming", label: "Yes, I'm a student" },
  { id: "not_student", label: "No" },
];

export const INSTITUTIONS = {
  uri: {
    id: "uri",
    name: "University of Rhode Island",
    city: "Kingston, RI",
    schoolName: "University of Rhode Island",
  },
} as const;

export type InstitutionId = keyof typeof INSTITUTIONS;

export const INTEREST_OPTIONS = [
  { id: "athletics", label: "Athletics" },
  { id: "music", label: "Music" },
  { id: "gaming", label: "Gaming" },
  { id: "fitness", label: "Fitness" },
  { id: "academics", label: "Academics" },
  { id: "art", label: "Art" },
  { id: "career", label: "Career" },
  { id: "clubs", label: "Clubs" },
  { id: "volunteering", label: "Volunteering" },
  { id: "outdoors", label: "Outdoors" },
  { id: "food", label: "Food" },
  { id: "tech", label: "Tech" },
  { id: "theater", label: "Theater" },
  { id: "competitions", label: "Competitions" },
  { id: "other", label: "Other" },
] as const;

export type InterestId = (typeof INTEREST_OPTIONS)[number]["id"];

export const INTEREST_ID_SET = new Set<string>(INTEREST_OPTIONS.map((o) => o.id));

export const MIN_INTERESTS = 3;
export const MAX_INTERESTS = 15;

export const COMMUNITY_OPTIONS = [
  { id: "athletics", label: "Athletics" },
  { id: "student_organizations", label: "Student Organizations" },
  { id: "greek_life", label: "Greek Life" },
  { id: "talent_development", label: "Talent Development" },
  { id: "fine_arts", label: "Fine Arts" },
  { id: "graduate_students", label: "Graduate Students" },
  { id: "engineering", label: "Engineering" },
  { id: "business", label: "Business" },
  { id: "computer_science", label: "Computer Science" },
  { id: "international_students", label: "International Students" },
  { id: "health_sciences", label: "Health Sciences" },
  { id: "other", label: "Other" },
] as const;

export type CommunityId = (typeof COMMUNITY_OPTIONS)[number]["id"];

export const COMMUNITY_ID_SET = new Set<string>(COMMUNITY_OPTIONS.map((o) => o.id));

/** Map legacy free-text interest labels → stable IDs when possible. */
export function normalizeInterestIds(raw: string[]): InterestId[] {
  const out: InterestId[] = [];
  const seen = new Set<string>();
  for (const value of raw) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const lower = trimmed.toLowerCase().replace(/\s+/g, "_");
    const byId = INTEREST_OPTIONS.find((o) => o.id === lower || o.label.toLowerCase() === trimmed.toLowerCase());
    const id = (byId?.id ?? (INTEREST_ID_SET.has(lower) ? lower : null)) as InterestId | null;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function normalizeCommunityIds(raw: string[]): CommunityId[] {
  const out: CommunityId[] = [];
  const seen = new Set<string>();
  for (const value of raw) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const lower = trimmed.toLowerCase().replace(/\s+/g, "_");
    const byId = COMMUNITY_OPTIONS.find(
      (o) => o.id === lower || o.label.toLowerCase() === trimmed.toLowerCase(),
    );
    const id = (byId?.id ?? (COMMUNITY_ID_SET.has(lower) ? lower : null)) as CommunityId | null;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export const BRAND_LOGO_OFFICIAL = "/brand/logo/campusquest-logo-official.png" as const;

export const BRAND_KNIGHT = {
  thumbsUp: "/brand/knight/thumbs-up.png",
  presenting: "/brand/knight/presenting.png",
  pointing: "/brand/knight/pointing.png",
  presentingRight: "/brand/knight/presenting-right.png",
  welcoming: "/brand/knight/welcoming.png",
  heroic: "/brand/knight/heroic.png",
  reaching: "/brand/knight/reaching.png",
} as const;
