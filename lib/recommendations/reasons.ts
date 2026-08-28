import { COMMUNITY_OPTIONS, INTEREST_OPTIONS } from "@/lib/onboarding/taxonomy";
import type { RecommendationReason, RecommendationReasonCode } from "@/lib/recommendations/types";

const INTEREST_LABELS = new Map<string, string>(INTEREST_OPTIONS.map((option) => [option.id, option.label]));
const COMMUNITY_LABELS = new Map<string, string>(COMMUNITY_OPTIONS.map((option) => [option.id, option.label]));

export function recommendationReasonLabel(code: RecommendationReasonCode, topic?: string | null): string {
  if (code === "interest") {
    const label = topic ? INTEREST_LABELS.get(topic) ?? topic : "this";
    return `Because you're interested in ${label}`;
  }
  if (code === "community") {
    const label = topic ? COMMUNITY_LABELS.get(topic) ?? topic : "your communities";
    return `Matches your ${label} campus connection`;
  }
  if (code === "organization") return "From an organization you follow";
  if (code === "campus_wide") return "Campus-wide";
  if (code === "popular") return "Popular on campus";
  if (code === "happening_now") return "Happening now";
  return "Recommended for you";
}

export function buildRecommendationReason(args: {
  code: RecommendationReasonCode;
  topic?: string | null;
}): RecommendationReason {
  return {
    code: args.code,
    label: recommendationReasonLabel(args.code, args.topic),
  };
}
