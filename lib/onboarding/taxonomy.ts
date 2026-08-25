/**
 * Canonical onboarding taxonomies for CampusQuest.
 * Store stable IDs — never display strings alone.
 */

export const ONBOARDING_VERSION = 2 as const;

/** All allowed DB values, including legacy onboarding answers. */
export const STUDENT_STATUS = {
  current_or_incoming: "current_or_incoming",
  not_student: "not_student",
  current_student: "current_student",
  incoming_student: "incoming_student",
  graduate_student: "graduate_student",
  faculty_staff: "faculty_staff",
} as const;

export type StudentStatusId = (typeof STUDENT_STATUS)[keyof typeof STUDENT_STATUS];

export const STUDENT_STATUS_VALUES = [
  STUDENT_STATUS.current_or_incoming,
  STUDENT_STATUS.not_student,
  STUDENT_STATUS.current_student,
  STUDENT_STATUS.incoming_student,
  STUDENT_STATUS.graduate_student,
  STUDENT_STATUS.faculty_staff,
] as const;

/** Choices shown on the first-time user-type screen. Legacy IDs are not listed. */
export const STUDENT_STATUS_OPTIONS: Array<{ id: StudentStatusId; label: string }> = [
  { id: "current_student", label: "Current student" },
  { id: "incoming_student", label: "Incoming student" },
  { id: "graduate_student", label: "Graduate student" },
  { id: "faculty_staff", label: "Faculty or staff" },
];

export function isKnownStudentStatus(value?: string | null): value is StudentStatusId {
  return Boolean(value && (STUDENT_STATUS_VALUES as readonly string[]).includes(value));
}

/** Faculty/staff and the legacy "No" answer skip graduation year. */
export function shouldAskGraduationYear(status?: string | null): boolean {
  return status !== STUDENT_STATUS.faculty_staff && status !== STUDENT_STATUS.not_student;
}

export function isGraduateStudentStatus(status?: string | null): boolean {
  return status === STUDENT_STATUS.graduate_student;
}

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

export type CommunityKind = "community" | "academic_area" | "program" | "affiliation";

export const COMMUNITY_OPTIONS = [
  { id: "athletics", label: "Athletics", kind: "affiliation" },
  { id: "student_organizations", label: "Student Organizations", kind: "community" },
  { id: "greek_life", label: "Greek Life", kind: "affiliation" },
  { id: "talent_development", label: "Talent Development", kind: "program" },
  { id: "fine_arts", label: "Fine Arts", kind: "academic_area" },
  { id: "graduate_students", label: "Graduate Students", kind: "community" },
  { id: "engineering", label: "Engineering", kind: "academic_area" },
  { id: "business", label: "Business", kind: "academic_area" },
  { id: "computer_science", label: "Computer Science", kind: "academic_area" },
  { id: "international_students", label: "International Students", kind: "community" },
  { id: "health_sciences", label: "Health Sciences", kind: "academic_area" },
  { id: "other", label: "Other", kind: "community" },
] as const satisfies ReadonlyArray<{ id: string; label: string; kind: CommunityKind }>;

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

/**
 * Official CQ logo for onboarding / splash.
 * Use the existing transparent RGBA asset (`/campusquest-logo.png`), not
 * `/brand/logo/campusquest-logo-official.png` (JPEG with opaque black fill).
 */
export { CAMPUSQUEST_LOGO_SRC as BRAND_LOGO_OFFICIAL } from "@/lib/branding";

export const BRAND_KNIGHT = {
  thumbsUp: "/brand/knight/thumbs-up.png",
  presenting: "/brand/knight/presenting.png",
  pointing: "/brand/knight/pointing.png",
  presentingRight: "/brand/knight/presenting-right.png",
  welcoming: "/brand/knight/welcoming.png",
  heroic: "/brand/knight/heroic.png",
  reaching: "/brand/knight/reaching.png",
} as const;
