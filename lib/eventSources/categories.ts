import {
  CANONICAL_EVENT_CATEGORIES,
  type CanonicalEventCategory,
  type EventSourceType,
} from "@/lib/eventSources/types";
import { coerceEventSourceType } from "@/lib/eventSources/catalog";

export { CANONICAL_EVENT_CATEGORIES };

const SOURCE_DEFAULT_CATEGORY: Record<EventSourceType, CanonicalEventCategory> = {
  urinvolved: "Clubs",
  athletics: "Athletics",
  fine_arts: "Fine Arts",
  academic: "Academic",
  career: "Career",
  recreation: "Recreation",
  department: "Academic",
  campusquest: "Campus Life",
  manual: "Campus Life",
};

const LABEL_LOOKUP = new Map(
  CANONICAL_EVENT_CATEGORIES.map((label) => [label.toLowerCase(), label]),
);

const KEYWORD_RULES: Array<{ category: CanonicalEventCategory; pattern: RegExp }> = [
  { category: "Athletics", pattern: /\bathletics\b|\bgame day\b|\bgameday\b|\bvs\.?\b|\brams?\b/ },
  { category: "Fine Arts", pattern: /\bfine arts\b|\bconcert\b|\btheatre\b|\btheater\b|\bgallery\b|\borchestra\b|\bchoir\b|\bperformance\b/ },
  { category: "Career", pattern: /\bcareer\b|\binternship\b|\bresume\b|\brecruit|\bnetworking\b|\bjob fair\b/ },
  { category: "Entrepreneurship", pattern: /\bentrepreneur|\bstartup\b|\bventure\b|\bincubator\b|\bpitch\b/ },
  { category: "Academic", pattern: /\blecture\b|\bseminar\b|\bacademic\b|\bcolloquium\b|\bworkshop\b|\bresearch\b/ },
  { category: "Recreation", pattern: /\brecreation\b|\bintramural\b|\bfitness\b|\bwellness\b|\bworkout\b/ },
  { category: "Community", pattern: /\bcommunity\b|\bvolunteer\b|\bservice\b|\bphilanthrop/ },
  { category: "Social", pattern: /\bsocial\b|\bgathering\b|\bmixer\b|\bparty\b|\bbingos?\b|\bsocial \/ gatherings/ },
  { category: "Clubs", pattern: /\bclub\b|\bstudent org|\binvolvement\b/ },
];

export function canonicalEventCategory(input: {
  source?: string | null;
  category?: string | null;
  sport?: string | null;
  title?: string | null;
  tags?: string[] | null;
}): CanonicalEventCategory {
  const source = coerceEventSourceType(input.source);
  if (source === "athletics" || input.sport?.trim()) return "Athletics";

  const raw = (input.category ?? "").trim();
  if (raw) {
    const exact = LABEL_LOOKUP.get(raw.toLowerCase());
    if (exact) return exact;
  }

  const haystack = [raw, input.title, ...(input.tags ?? [])].filter(Boolean).join(" ").toLowerCase();
  for (const rule of KEYWORD_RULES) {
    if (rule.pattern.test(haystack)) return rule.category;
  }

  return SOURCE_DEFAULT_CATEGORY[source];
}

export function eventMatchesCanonicalCategory(
  event: {
    source?: string | null;
    category?: string | null;
    sport?: string | null;
    title?: string | null;
    tags?: string[] | null;
  },
  filter: string,
): boolean {
  const needle = filter.trim().toLowerCase();
  if (!needle) return true;
  const canonical = canonicalEventCategory(event);
  if (canonical.toLowerCase() === needle) return true;
  if ((event.category ?? "").toLowerCase().includes(needle)) return true;
  return false;
}

export function defaultCategoryForSource(source: string | null | undefined): CanonicalEventCategory {
  return SOURCE_DEFAULT_CATEGORY[coerceEventSourceType(source)];
}
