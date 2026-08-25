import type { RecommendationEntity } from "@/lib/recommendations/types";

const CAMPUS_WIDE_PATTERN =
  /\brhody\s*fest\b|\bwelcome week\b|\borientation\b|\bcommencement\b|\bhomecoming\b|\bcampus[- ]wide\b|\ball[- ]campus\b|\buniversity[- ]wide\b|\binvolvement fair\b|\buri alert\b/;

export function isCampusWideImportant(entity: RecommendationEntity): boolean {
  if (entity.featured === true || entity.campusMajor === true) return true;
  const haystack = [entity.title, entity.description ?? "", entity.category ?? "", ...(entity.tags ?? [])]
    .join(" ")
    .toLowerCase();
  return CAMPUS_WIDE_PATTERN.test(haystack);
}
