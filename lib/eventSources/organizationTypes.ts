import { coerceEventSourceType } from "@/lib/eventSources/catalog";
import type { EventSourceType, OrganizationType } from "@/lib/eventSources/types";

const SOURCE_DEFAULT_ORG_TYPE: Record<EventSourceType, OrganizationType> = {
  urinvolved: "student_club",
  athletics: "athletics_team",
  fine_arts: "arts_group",
  academic: "academic_department",
  career: "campus_office",
  recreation: "program",
  department: "academic_department",
  campusquest: "student_club",
  manual: "program",
};

const TYPE_LABELS: Record<OrganizationType, string> = {
  student_club: "Student club",
  athletics_team: "Athletics team",
  academic_department: "Academic department",
  campus_office: "Campus office",
  arts_group: "Arts group",
  entrepreneurship: "Entrepreneurship",
  program: "Program",
  campus_service: "Campus service",
  student_business: "Student business",
  other: "Organization",
};

export function organizationTypeForSource(source: string | null | undefined): OrganizationType {
  return SOURCE_DEFAULT_ORG_TYPE[coerceEventSourceType(source)];
}

export function organizationTypeLabel(type: string | null | undefined): string {
  if (type && type in TYPE_LABELS) return TYPE_LABELS[type as OrganizationType];
  return "Organization";
}

export function inferOrganizationType(input: {
  source?: string | null;
  organizationType?: string | null;
  category?: string | null;
  name?: string | null;
}): OrganizationType {
  if (input.organizationType && input.organizationType in TYPE_LABELS) {
    return input.organizationType as OrganizationType;
  }
  const haystack = `${input.category ?? ""} ${input.name ?? ""}`.toLowerCase();
  if (/\bathletics\b|\bteam\b|\brams?\b/.test(haystack)) return "athletics_team";
  if (/\bdepartment\b|\bcollege of\b/.test(haystack)) return "academic_department";
  if (/\boffice of\b|\bcampus services?\b/.test(haystack)) return "campus_office";
  if (/\bentrepreneur|\bstartup\b/.test(haystack)) return "entrepreneurship";
  if (/\btheatre\b|\btheater\b|\bchoir\b|\borchestra\b|\bgallery\b/.test(haystack)) return "arts_group";
  return organizationTypeForSource(input.source);
}
