import { suppressSmallCohorts, type PublicCohortRow } from "@/lib/onboarding/analyticsPrivacy";
import {
  classStandingLabel,
  deriveClassStanding,
  type ClassStandingId,
} from "@/lib/onboarding/graduationYear";
import {
  normalizeCommunityIds,
  normalizeInterestIds,
} from "@/lib/onboarding/taxonomy";
import {
  buildVerifiedAttendance,
  type QrCodeAttendanceFields,
  type QrScanAttendanceFields,
} from "@/lib/server/engagementAttendance";

export type EngagementFixtureProfile = {
  id: string;
  role?: string | null;
  class_year?: number | null;
  onboarding_completed?: boolean | null;
  last_active_at?: string | null;
  excluded?: boolean;
};

export type EngagementFixturePrefs = {
  user_id: string;
  interests?: string[];
  communities?: string[];
};

export type EngagementFixturePost = { user_id: string };
export type EngagementFixtureRsvp = { user_id: string; event_id: string };

function bump(map: Map<string, { unique: Set<string>; events: number }>, key: string, userId: string) {
  let entry = map.get(key);
  if (!entry) {
    entry = { unique: new Set(), events: 0 };
    map.set(key, entry);
  }
  entry.unique.add(userId);
  entry.events += 1;
}

function toCohortRows(
  map: Map<string, { unique: Set<string>; events: number }>,
  labelFor: (key: string) => string,
): PublicCohortRow[] {
  const raw = Array.from(map.entries()).map(([key, v]) => ({
    key,
    label: labelFor(key),
    uniqueStudents: v.unique.size,
    totalEvents: v.events,
  }));
  raw.sort((a, b) => b.uniqueStudents - a.uniqueStudents || a.label.localeCompare(b.label));
  return suppressSmallCohorts(raw);
}

/**
 * Pure engagement aggregation used by admin analytics + unit fixtures.
 * Excluded profiles (test/internal) must be marked `excluded: true` by the caller.
 */
export function aggregateStudentEngagementFixtures(args: {
  profiles: EngagementFixtureProfile[];
  prefs: EngagementFixturePrefs[];
  posts: EngagementFixturePost[];
  rsvps: EngagementFixtureRsvp[];
  scans: QrScanAttendanceFields[];
  qrCodes: QrCodeAttendanceFields[];
  rangeStartIso: string;
  rangeEndIso: string;
}) {
  const eligible = args.profiles.filter(
    (p) => !p.excluded && (p.role ?? "student") === "student",
  );
  const profileById = new Map(eligible.map((p) => [p.id, p]));
  const eligibleIds = new Set(eligible.map((p) => p.id));
  const prefsMap = new Map(args.prefs.map((p) => [p.user_id, p]));

  const posts = args.posts.filter((p) => eligibleIds.has(p.user_id));
  const rsvps = args.rsvps.filter((r) => eligibleIds.has(r.user_id));
  const qrById = new Map(args.qrCodes.map((q) => [q.id, q]));
  const attendance = buildVerifiedAttendance({
    scans: args.scans,
    qrById,
    eligibleUserIds: eligibleIds,
  });

  const activeStudents = eligible.filter((p) => {
    if (!p.last_active_at) return false;
    return p.last_active_at >= args.rangeStartIso && p.last_active_at <= args.rangeEndIso;
  });

  const uniquePosters = new Set(posts.map((p) => p.user_id));
  const uniqueRsvpers = new Set(rsvps.map((r) => r.user_id));
  const onboarded = eligible.filter((p) => p.onboarding_completed).length;

  const postsByInterest = new Map<string, { unique: Set<string>; events: number }>();
  const postsByCommunity = new Map<string, { unique: Set<string>; events: number }>();
  for (const post of posts) {
    const prefs = prefsMap.get(post.user_id);
    for (const id of normalizeInterestIds(prefs?.interests ?? [])) bump(postsByInterest, id, post.user_id);
    for (const id of normalizeCommunityIds(prefs?.communities ?? [])) bump(postsByCommunity, id, post.user_id);
  }

  const yearMakeup = new Map<string, { unique: Set<string>; events: number }>();
  for (const p of eligible) {
    bump(yearMakeup, p.class_year != null ? String(p.class_year) : "unknown", p.id);
  }

  const standingMakeup = new Map<string, { unique: Set<string>; events: number }>();
  for (const p of eligible) {
    bump(standingMakeup, deriveClassStanding(p.class_year), p.id);
  }

  return {
    metrics: {
      activeStudents: activeStudents.length,
      studentsPosting: uniquePosters.size,
      postsCreated: posts.length,
      eventRsvps: rsvps.length,
      uniqueEventRsvpers: uniqueRsvpers.size,
      verifiedEventAttendees: attendance.uniqueAttendeeUserIds.size,
      verifiedAttendancePairs: attendance.records.length,
      onboardingCompletionRate:
        eligible.length > 0 ? Math.round((onboarded / eligible.length) * 1000) / 10 : 0,
      totalStudents: eligible.length,
      onboardedStudents: onboarded,
    },
    notes: {
      cohortOverlap:
        "Interest and community cohort totals may overlap when a student belongs to multiple cohorts. They do not sum to the unique total.",
    },
    postingByInterest: toCohortRows(postsByInterest, (k) => k),
    postingByCommunity: toCohortRows(postsByCommunity, (k) => k),
    studentMakeupByYear: toCohortRows(yearMakeup, (k) => k),
    studentMakeupByStanding: toCohortRows(standingMakeup, (k) =>
      classStandingLabel(k as ClassStandingId),
    ),
    attendanceByEvent: attendance.byEvent,
    uniqueAttendeeUserIds: attendance.uniqueAttendeeUserIds,
  };
}
