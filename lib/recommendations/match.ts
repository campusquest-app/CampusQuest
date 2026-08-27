import {
  COMMUNITY_OPTIONS,
  INTEREST_ID_SET,
  INTEREST_OPTIONS,
  type CommunityId,
  type InterestId,
} from "@/lib/onboarding/taxonomy";
import type { RecommendationEntity, RecommendationMatch } from "@/lib/recommendations/types";

const INTEREST_LABEL_TO_ID = new Map(
  INTEREST_OPTIONS.map((option) => [option.label.toLowerCase(), option.id as string]),
);
const COMMUNITY_LABEL_TO_ID = new Map(
  COMMUNITY_OPTIONS.map((option) => [option.label.toLowerCase(), option.id as string]),
);

const CATEGORY_TO_INTERESTS: Record<string, InterestId[]> = {
  athletics: ["athletics"],
  sports: ["athletics"],
  sport: ["athletics"],
  recreation: ["fitness"],
  fitness: ["fitness"],
  wellness: ["fitness"],
  music: ["music"],
  concert: ["music"],
  arts: ["art"],
  art: ["art"],
  theatre: ["theater"],
  theater: ["theater"],
  career: ["career"],
  professional: ["career"],
  academic: ["academics"],
  academics: ["academics"],
  education: ["academics"],
  technology: ["tech"],
  tech: ["tech"],
  computer: ["tech"],
  gaming: ["gaming"],
  esports: ["gaming"],
  food: ["food"],
  dining: ["food"],
  volunteer: ["volunteering"],
  service: ["volunteering"],
  outdoors: ["outdoors"],
  outdoor: ["outdoors"],
  entrepreneurship: ["career"],
  "fine arts": ["art", "theater", "music"],
  "campus life": ["clubs"],
  community: ["volunteering"],
  clubs: ["clubs"],
  involvement: ["clubs"],
  social: ["clubs"],
};

const CATEGORY_TO_COMMUNITIES: Record<string, CommunityId[]> = {
  athletics: ["athletics"],
  sports: ["athletics"],
  greek: ["greek_life"],
  "greek life": ["greek_life"],
  fsl: ["greek_life"],
  engineering: ["engineering"],
  business: ["business"],
  "computer science": ["computer_science"],
  computing: ["computer_science"],
  "fine arts": ["fine_arts"],
  arts: ["fine_arts"],
  graduate: ["graduate_students"],
  "health sciences": ["health_sciences"],
  health: ["health_sciences"],
  international: ["international_students"],
  "talent development": ["talent_development"],
  organizations: ["student_organizations"],
  clubs: ["student_organizations"],
};

type KeywordRule = { pattern: RegExp; interests?: InterestId[]; communities?: CommunityId[] };

/** Most specific rules first. Conservative fallback only. */
const KEYWORD_RULES: KeywordRule[] = [
  { pattern: /\btalent development\b|\btdi\b/, communities: ["talent_development"] },
  { pattern: /\bhackathon\b|\bcoding competition\b/, interests: ["tech", "competitions"], communities: ["computer_science"] },
  { pattern: /\bcareer fair\b|\binternship fair\b|\bresume\b|\brecruit(ing|er)?\b/, interests: ["career"], communities: ["business"] },
  { pattern: /\bstudent org(anization)? fair\b|\binvolvement fair\b|\bclub fair\b/, interests: ["clubs"], communities: ["student_organizations"] },
  {
    pattern:
      /\bbasketball\b|\bfootball\b|\bsoccer\b|\bhockey\b|\bbaseball\b|\bvolleyball\b|\blacrosse\b|\bintramural\b|\bgameday\b|\bgame day\b|\bathletics\b/,
    interests: ["athletics"],
    communities: ["athletics"],
  },
  {
    pattern: /\bconcert\b|\bchoir\b|\borchestra\b|\ba cappella\b|\bopen mic\b|\bdj set\b|\bmusic\b/,
    interests: ["music"],
    communities: ["fine_arts"],
  },
  { pattern: /\btheater\b|\btheatre\b|\bdrama\b|\bmusical\b|\bimprov\b/, interests: ["theater"], communities: ["fine_arts"] },
  { pattern: /\bgallery\b|\bexhibit\b|\bart show\b|\bfine arts\b/, interests: ["art"], communities: ["fine_arts"] },
  { pattern: /\besports\b|\bvideo game\b|\bgaming\b|\bsmash bros\b/, interests: ["gaming"] },
  { pattern: /\byoga\b|\bworkout\b|\bfitness\b|\bgym class\b|\brec center\b/, interests: ["fitness"] },
  { pattern: /\bhike\b|\boutdoors\b|\btrail\b|\bkayak\b|\bcamping\b/, interests: ["outdoors"] },
  { pattern: /\bvolunteer\b|\bcommunity service\b|\bphilanthropy\b|\bhabitat for humanity\b/, interests: ["volunteering"] },
  { pattern: /\bcomputer science\b|\bcoding\b|\bsoftware\b|\bai\b|\bmachine learning\b/, interests: ["tech"], communities: ["computer_science"] },
  { pattern: /\bengineering\b/, communities: ["engineering"], interests: ["academics"] },
  { pattern: /\bbusiness school\b|\bcollege of business\b|\bentrepreneur/, communities: ["business"], interests: ["career"] },
  { pattern: /\bgraduate student\b|\bgrad school\b|\bmasters\b|\bphd\b/, communities: ["graduate_students"] },
  { pattern: /\binternational student\b/, communities: ["international_students"] },
  { pattern: /\bfraternit|\bsororit|\bgreek life\b/, communities: ["greek_life"] },
  { pattern: /\bhealth sciences\b|\bnursing\b|\bpharmacy\b|\bkinesiology\b/, communities: ["health_sciences"] },
  { pattern: /\blecture\b|\bseminar\b|\btutoring\b|\bstudy hall\b/, interests: ["academics"] },
  { pattern: /\btournament\b|\bcompetition\b|\bcontest\b/, interests: ["competitions"] },
  { pattern: /\bfood truck\b|\btaste of\b|\bcooking\b|\bdining\b/, interests: ["food"] },
];

function pushUnique(target: string[], value: string | undefined) {
  if (!value || target.includes(value)) return;
  target.push(value);
}

function addFromToken(token: string, interests: string[], communities: string[]) {
  const normalized = token.trim().toLowerCase();
  if (!normalized) return;
  if (INTEREST_ID_SET.has(normalized)) pushUnique(interests, normalized);
  const interestFromLabel = INTEREST_LABEL_TO_ID.get(normalized);
  if (interestFromLabel) pushUnique(interests, interestFromLabel);
  const communityFromLabel = COMMUNITY_LABEL_TO_ID.get(normalized);
  if (communityFromLabel) pushUnique(communities, communityFromLabel);
  const mappedInterests = CATEGORY_TO_INTERESTS[normalized];
  if (mappedInterests) for (const id of mappedInterests) pushUnique(interests, id);
  const mappedCommunities = CATEGORY_TO_COMMUNITIES[normalized];
  if (mappedCommunities) for (const id of mappedCommunities) pushUnique(communities, id);
}

function studentTypeHintsFromText(haystack: string): string[] {
  const hints: string[] = [];
  if (/orientation|welcome week|first[- ]year|incoming student|ram welcome/.test(haystack)) {
    hints.push("incoming_student");
  }
  if (/graduate student|grad school|\bphd\b|masters/.test(haystack)) hints.push("graduate_student");
  if (/faculty|staff professional|employee/.test(haystack)) hints.push("faculty_staff");
  if (/career fair|commencement|senior/.test(haystack)) hints.push("senior");
  return hints;
}

export function matchRecommendationTopics(entity: RecommendationEntity): RecommendationMatch {
  const interests: string[] = [];
  const communities: string[] = [];

  addFromToken(entity.category ?? "", interests, communities);
  for (const tag of entity.tags ?? []) addFromToken(tag, interests, communities);
  addFromToken(entity.organizationName ?? "", interests, communities);

  const haystack = [
    entity.title,
    entity.description ?? "",
    entity.category ?? "",
    entity.organizationName ?? "",
    entity.locationName ?? "",
    ...(entity.tags ?? []),
  ]
    .join(" ")
    .toLowerCase();

  for (const rule of KEYWORD_RULES) {
    if (rule.pattern.test(haystack)) {
      for (const id of rule.interests ?? []) pushUnique(interests, id);
      for (const id of rule.communities ?? []) pushUnique(communities, id);
    }
  }

  return {
    interestIds: interests,
    communityIds: communities,
    primaryTopic: interests[0] ?? communities[0] ?? null,
    campusImportant: false,
    studentTypeHints: studentTypeHintsFromText(haystack),
  };
}
