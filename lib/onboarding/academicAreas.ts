/**
 * Optional academic area / major catalog for onboarding.
 * Store `academic_area` as a stable ID and `major` as a display label.
 * Broad areas remain valid when an exact major is not chosen.
 */

export const ACADEMIC_AREA_OPTIONS = [
  { id: "undecided", label: "Undecided / Not sure" },
  { id: "arts_humanities", label: "Arts & Humanities" },
  { id: "business", label: "Business" },
  { id: "communications", label: "Communications" },
  { id: "computer_science", label: "Computer Science" },
  { id: "education", label: "Education" },
  { id: "engineering", label: "Engineering" },
  { id: "environment", label: "Environment & Life Sciences" },
  { id: "health_sciences", label: "Health Sciences" },
  { id: "nursing", label: "Nursing" },
  { id: "pharmacy", label: "Pharmacy" },
  { id: "social_sciences", label: "Social Sciences" },
  { id: "other", label: "Other" },
] as const;

export type AcademicAreaId = (typeof ACADEMIC_AREA_OPTIONS)[number]["id"];

export const ACADEMIC_AREA_ID_SET = new Set<string>(ACADEMIC_AREA_OPTIONS.map((option) => option.id));

export const MAJOR_OPTIONS = [
  { id: "accounting", label: "Accounting", academicArea: "business" },
  { id: "applied_math", label: "Applied Mathematics", academicArea: "arts_humanities" },
  { id: "biology", label: "Biology", academicArea: "environment" },
  { id: "biomedical_engineering", label: "Biomedical Engineering", academicArea: "engineering" },
  { id: "business_administration", label: "Business Administration", academicArea: "business" },
  { id: "chemical_engineering", label: "Chemical Engineering", academicArea: "engineering" },
  { id: "chemistry", label: "Chemistry", academicArea: "arts_humanities" },
  { id: "civil_engineering", label: "Civil Engineering", academicArea: "engineering" },
  { id: "communication_studies", label: "Communication Studies", academicArea: "communications" },
  { id: "computer_engineering", label: "Computer Engineering", academicArea: "engineering" },
  { id: "computer_science", label: "Computer Science", academicArea: "computer_science" },
  { id: "criminology", label: "Criminology & Criminal Justice", academicArea: "social_sciences" },
  { id: "data_science", label: "Data Science", academicArea: "computer_science" },
  { id: "education", label: "Education", academicArea: "education" },
  { id: "electrical_engineering", label: "Electrical Engineering", academicArea: "engineering" },
  { id: "english", label: "English", academicArea: "arts_humanities" },
  { id: "environmental_science", label: "Environmental Science", academicArea: "environment" },
  { id: "finance", label: "Finance", academicArea: "business" },
  { id: "history", label: "History", academicArea: "arts_humanities" },
  { id: "journalism", label: "Journalism", academicArea: "communications" },
  { id: "kinesiology", label: "Kinesiology", academicArea: "health_sciences" },
  { id: "management", label: "Management", academicArea: "business" },
  { id: "marine_biology", label: "Marine Biology", academicArea: "environment" },
  { id: "marketing", label: "Marketing", academicArea: "business" },
  { id: "mechanical_engineering", label: "Mechanical Engineering", academicArea: "engineering" },
  { id: "music", label: "Music", academicArea: "arts_humanities" },
  { id: "nursing", label: "Nursing", academicArea: "nursing" },
  { id: "ocean_engineering", label: "Ocean Engineering", academicArea: "engineering" },
  { id: "pharmacy", label: "Pharmacy", academicArea: "pharmacy" },
  { id: "physics", label: "Physics", academicArea: "arts_humanities" },
  { id: "political_science", label: "Political Science", academicArea: "social_sciences" },
  { id: "psychology", label: "Psychology", academicArea: "social_sciences" },
  { id: "public_relations", label: "Public Relations", academicArea: "communications" },
  { id: "sociology", label: "Sociology", academicArea: "social_sciences" },
  { id: "textiles", label: "Textiles, Fashion Merchandising & Design", academicArea: "arts_humanities" },
  { id: "wildlife_conservation", label: "Wildlife & Conservation Biology", academicArea: "environment" },
] as const;

export type MajorId = (typeof MAJOR_OPTIONS)[number]["id"];

const AREA_LABELS = new Map<string, string>(ACADEMIC_AREA_OPTIONS.map((option) => [option.id, option.label]));

export function isKnownAcademicArea(value?: string | null): value is AcademicAreaId {
  return Boolean(value && ACADEMIC_AREA_ID_SET.has(value));
}

export function academicAreaLabel(id?: string | null): string | null {
  if (!id) return null;
  return AREA_LABELS.get(id) ?? null;
}

export function normalizeAcademicAreaId(value?: string | null): AcademicAreaId | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase().replace(/\s+/g, "_");
  if (isKnownAcademicArea(trimmed)) return trimmed;
  const byLabel = ACADEMIC_AREA_OPTIONS.find((option) => option.label.toLowerCase() === value.trim().toLowerCase());
  return byLabel?.id ?? null;
}

export type AcademicSelection = {
  academicArea: AcademicAreaId | null;
  major: string | null;
};

export function selectionFromMajorId(majorId: string): AcademicSelection | null {
  const major = MAJOR_OPTIONS.find((option) => option.id === majorId);
  if (!major) return null;
  return { academicArea: major.academicArea, major: major.label };
}

export function selectionFromAcademicArea(areaId: string): AcademicSelection | null {
  if (!isKnownAcademicArea(areaId)) return null;
  if (areaId === "undecided" || areaId === "other") {
    return { academicArea: areaId, major: null };
  }
  return { academicArea: areaId, major: null };
}

export function filterAcademicChoices(query: string): {
  areas: Array<(typeof ACADEMIC_AREA_OPTIONS)[number]>;
  majors: Array<(typeof MAJOR_OPTIONS)[number]>;
} {
  const q = query.trim().toLowerCase();
  if (!q) {
    return { areas: [...ACADEMIC_AREA_OPTIONS], majors: [] };
  }
  const areas = ACADEMIC_AREA_OPTIONS.filter((option) => option.label.toLowerCase().includes(q));
  const majors = MAJOR_OPTIONS.filter(
    (option) => option.label.toLowerCase().includes(q) || option.academicArea.includes(q.replace(/\s+/g, "_")),
  );
  return { areas, majors };
}

/** Map an academic area onto existing campus-connection IDs without writing conflicting stored values. */
export function communityIdsFromAcademicArea(area?: string | null): string[] {
  switch (area) {
    case "engineering":
      return ["engineering"];
    case "business":
      return ["business"];
    case "computer_science":
      return ["computer_science"];
    case "health_sciences":
    case "nursing":
    case "pharmacy":
      return ["health_sciences"];
    case "arts_humanities":
      return ["fine_arts"];
    default:
      return [];
  }
}
