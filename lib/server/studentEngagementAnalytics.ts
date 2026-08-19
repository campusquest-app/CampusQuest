import { ApiError } from "@/lib/server/http";
import {
  PILOT_ANALYTICS_TIMEZONE,
  rollingWindowStartMs,
  startOfCalendarDayInTimeZone,
} from "@/lib/server/analyticsTime";
import { suppressSmallCohorts, type PublicCohortRow } from "@/lib/onboarding/analyticsPrivacy";
import {
  classStandingLabel,
  deriveClassStanding,
  type ClassStandingId,
} from "@/lib/onboarding/graduationYear";
import {
  COMMUNITY_OPTIONS,
  INTEREST_OPTIONS,
  normalizeCommunityIds,
  normalizeInterestIds,
} from "@/lib/onboarding/taxonomy";
import { listAnalyticsExcludedUserIds } from "@/lib/server/qaTestAccount";
import { createAdminClient } from "@/lib/server/supabase";
import {
  buildVerifiedAttendance,
  type QrCodeAttendanceFields,
} from "@/lib/server/engagementAttendance";

export type EngagementRangePreset = "7d" | "30d" | "semester" | "custom";

export type EngagementDateRange = {
  preset: EngagementRangePreset;
  startIso: string;
  endIso: string;
};

type ProfileDemoRow = {
  id: string;
  role: string | null;
  class_year: number | null;
  student_status: string | null;
  institution_id: string | null;
  onboarding_completed: boolean | null;
  onboarding_version: number | null;
  last_active_at: string | null;
  created_at: string | null;
};

type PrefsRow = {
  user_id: string;
  interests: string[] | null;
  communities: string[] | null;
};

function isStudentRole(role: string | null | undefined): boolean {
  return (role ?? "student") === "student";
}

/** URI fall semester start (Aug 1) → spring end (May 31 next year), America/New_York. */
export function resolveEngagementDateRange(args: {
  preset: EngagementRangePreset;
  start?: string | null;
  end?: string | null;
  now?: Date;
}): EngagementDateRange {
  const now = args.now ?? new Date();
  const endIso = now.toISOString();
  if (args.preset === "7d") {
    return { preset: "7d", startIso: rollingWindowStartMs(7, now).toISOString(), endIso };
  }
  if (args.preset === "30d") {
    return { preset: "30d", startIso: rollingWindowStartMs(30, now).toISOString(), endIso };
  }
  if (args.preset === "semester") {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: PILOT_ANALYTICS_TIMEZONE,
      year: "numeric",
      month: "numeric",
    }).formatToParts(now);
    const year = Number(parts.find((p) => p.type === "year")?.value);
    const month = Number(parts.find((p) => p.type === "month")?.value);
    // Aug–Dec → fall semester starting Aug 1; Jan–Jul → spring starting prior Aug 1
    const fallStartYear = month >= 8 ? year : year - 1;
    const start = startOfCalendarDayInTimeZone(
      PILOT_ANALYTICS_TIMEZONE,
      new Date(Date.UTC(fallStartYear, 7, 1, 12, 0, 0)),
    );
    return { preset: "semester", startIso: start.toISOString(), endIso };
  }
  const startRaw = args.start?.trim();
  const endRaw = args.end?.trim();
  if (!startRaw || !endRaw) {
    throw new ApiError(400, "Custom range requires start and end dates.", "ENGAGEMENT_RANGE_INVALID");
  }
  const startMs = Date.parse(startRaw);
  const endMs = Date.parse(endRaw);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    throw new ApiError(400, "Invalid custom date range.", "ENGAGEMENT_RANGE_INVALID");
  }
  const maxSpan = 400 * 24 * 60 * 60 * 1000;
  if (endMs - startMs > maxSpan) {
    throw new ApiError(400, "Custom range cannot exceed 400 days.", "ENGAGEMENT_RANGE_TOO_LONG");
  }
  return { preset: "custom", startIso: new Date(startMs).toISOString(), endIso: new Date(endMs).toISOString() };
}

function interestLabel(id: string): string {
  return INTEREST_OPTIONS.find((o) => o.id === id)?.label ?? id;
}

function communityLabel(id: string): string {
  return COMMUNITY_OPTIONS.find((o) => o.id === id)?.label ?? id;
}

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

async function loadStudentProfiles(
  admin: ReturnType<typeof createAdminClient>,
  excludedIds: Set<string>,
): Promise<ProfileDemoRow[]> {
  const { data, error } = await admin
    .from("profiles")
    .select(
      "id, role, class_year, student_status, institution_id, onboarding_completed, onboarding_version, last_active_at, created_at",
    )
    .limit(20_000);
  if (error) {
    if (/student_status|institution_id|onboarding_version/i.test(error.message)) {
      throw new ApiError(
        500,
        "Onboarding demographics migration is required. Apply supabase/migrations/20260818220000_onboarding_demographics_v2.sql.",
        "SCHEMA_MIGRATION_REQUIRED",
      );
    }
    throw new ApiError(400, error.message, "ENGAGEMENT_PROFILES_FAILED");
  }
  return ((data ?? []) as ProfileDemoRow[])
    .filter((row) => !excludedIds.has(row.id))
    .filter((row) => isStudentRole(row.role));
}

async function loadPrefsMap(
  admin: ReturnType<typeof createAdminClient>,
  userIds: string[],
): Promise<Map<string, PrefsRow>> {
  const map = new Map<string, PrefsRow>();
  if (userIds.length === 0) return map;
  const chunkSize = 200;
  for (let i = 0; i < userIds.length; i += chunkSize) {
    const chunk = userIds.slice(i, i + chunkSize);
    const { data, error } = await admin
      .from("user_onboarding_preferences")
      .select("user_id, interests, communities")
      .in("user_id", chunk);
    if (error) {
      if (/communities/i.test(error.message)) {
        throw new ApiError(
          500,
          "Onboarding demographics migration is required. Apply supabase/migrations/20260818220000_onboarding_demographics_v2.sql.",
          "SCHEMA_MIGRATION_REQUIRED",
        );
      }
      throw new ApiError(400, error.message, "ENGAGEMENT_PREFS_FAILED");
    }
    for (const row of data ?? []) {
      map.set(row.user_id as string, {
        user_id: row.user_id as string,
        interests: (row.interests as string[] | null) ?? [],
        communities: (row.communities as string[] | null) ?? [],
      });
    }
  }
  return map;
}

export async function getStudentEngagementAnalytics(range: EngagementDateRange) {
  const admin = createAdminClient();
  const excludedIds = await listAnalyticsExcludedUserIds(admin);
  const profiles = await loadStudentProfiles(admin, excludedIds);
  const profileById = new Map(profiles.map((p) => [p.id, p]));
  const studentIds = profiles.map((p) => p.id);
  const prefsMap = await loadPrefsMap(admin, studentIds);

  const { startIso, endIso } = range;

  const [
    { data: posts, error: postsErr },
    { data: rsvps, error: rsvpsErr },
    { data: qrScans, error: qrErr },
    { data: events, error: eventsErr },
  ] = await Promise.all([
    admin
      .from("quad_posts")
      .select("id, user_id, created_at")
      .gte("created_at", startIso)
      .lte("created_at", endIso)
      .limit(50_000),
    admin
      .from("event_rsvps")
      .select("id, user_id, event_id, created_at, status")
      .gte("created_at", startIso)
      .lte("created_at", endIso)
      .limit(50_000),
    admin
      .from("qr_scans")
      .select("id, user_id, qr_code_id, scanned_at, status")
      .eq("status", "success")
      .gte("scanned_at", startIso)
      .lte("scanned_at", endIso)
      .limit(50_000),
    admin
      .from("campus_events")
      .select("id, title, starts_at")
      .order("starts_at", { ascending: false })
      .limit(200),
  ]);

  if (postsErr) throw new ApiError(400, postsErr.message, "ENGAGEMENT_POSTS_FAILED");
  if (rsvpsErr) throw new ApiError(400, rsvpsErr.message, "ENGAGEMENT_RSVPS_FAILED");
  if (eventsErr) throw new ApiError(400, eventsErr.message, "ENGAGEMENT_EVENTS_FAILED");

  const qrTablesMissing = Boolean(qrErr && /qr_scans|schema cache|Could not find the table/i.test(qrErr.message));
  if (qrErr && !qrTablesMissing) {
    throw new ApiError(400, qrErr.message, "ENGAGEMENT_ATTENDANCE_FAILED");
  }

  const studentPosts = (posts ?? []).filter((p) => profileById.has(p.user_id as string));
  const studentRsvps = (rsvps ?? []).filter((r) => profileById.has(r.user_id as string));

  const qrCodeIds = Array.from(
    new Set((qrScans ?? []).map((s) => s.qr_code_id as string).filter(Boolean)),
  );
  const qrById = new Map<string, QrCodeAttendanceFields>();
  let hasVerifiedAttendanceSignal = false;

  if (!qrTablesMissing && qrCodeIds.length > 0) {
    const { data: qrCodes, error: qrCodesErr } = await admin
      .from("qr_codes")
      .select("id, event_id, type, qr_type")
      .in("id", qrCodeIds.slice(0, 500));
    if (qrCodesErr) {
      throw new ApiError(400, qrCodesErr.message, "ENGAGEMENT_ATTENDANCE_FAILED");
    }
    for (const row of qrCodes ?? []) {
      qrById.set(row.id as string, {
        id: row.id as string,
        event_id: (row.event_id as string | null) ?? null,
        type: (row.type as string | null) ?? null,
        qr_type: (row.qr_type as string | null) ?? null,
      });
    }
    hasVerifiedAttendanceSignal = true;
  } else if (!qrTablesMissing) {
    // QR schema present; zero check-ins in range is a valid verified-attendance result.
    hasVerifiedAttendanceSignal = true;
  }

  const attendance = buildVerifiedAttendance({
    scans: (qrScans ?? []).map((s) => ({
      user_id: s.user_id as string,
      qr_code_id: s.qr_code_id as string,
      status: (s.status as string | null) ?? "success",
    })),
    qrById,
    eligibleUserIds: new Set(studentIds),
  });

  const activeStudents = profiles.filter((p) => {
    if (!p.last_active_at) return false;
    return p.last_active_at >= startIso && p.last_active_at <= endIso;
  });
  const uniquePosters = new Set(studentPosts.map((p) => p.user_id as string));
  const uniqueRsvpers = new Set(studentRsvps.map((r) => r.user_id as string));

  const onboarded = profiles.filter((p) => p.onboarding_completed).length;
  const onboardingCompletionRate =
    profiles.length > 0 ? Math.round((onboarded / profiles.length) * 1000) / 10 : 0;

  // Student makeup (all students — not date-filtered; demographic snapshot)
  const yearMap = new Map<string, { unique: Set<string>; events: number }>();
  const standingMap = new Map<string, { unique: Set<string>; events: number }>();
  const communityMakeup = new Map<string, { unique: Set<string>; events: number }>();
  const interestMakeup = new Map<string, { unique: Set<string>; events: number }>();

  for (const p of profiles) {
    const yearKey = p.class_year != null ? String(p.class_year) : "unknown";
    bump(yearMap, yearKey, p.id);
    const standing = deriveClassStanding(p.class_year);
    bump(standingMap, standing, p.id);
    const prefs = prefsMap.get(p.id);
    for (const id of normalizeInterestIds(prefs?.interests ?? [])) bump(interestMakeup, id, p.id);
    for (const id of normalizeCommunityIds(prefs?.communities ?? [])) bump(communityMakeup, id, p.id);
  }

  // Posting by cohort (overlapping cohorts intentional)
  const postsByYear = new Map<string, { unique: Set<string>; events: number }>();
  const postsByStanding = new Map<string, { unique: Set<string>; events: number }>();
  const postsByCommunity = new Map<string, { unique: Set<string>; events: number }>();
  const postsByInterest = new Map<string, { unique: Set<string>; events: number }>();

  for (const post of studentPosts) {
    const uid = post.user_id as string;
    const profile = profileById.get(uid);
    if (!profile) continue;
    const yearKey = profile.class_year != null ? String(profile.class_year) : "unknown";
    bump(postsByYear, yearKey, uid);
    bump(postsByStanding, deriveClassStanding(profile.class_year), uid);
    const prefs = prefsMap.get(uid);
    for (const id of normalizeInterestIds(prefs?.interests ?? [])) bump(postsByInterest, id, uid);
    for (const id of normalizeCommunityIds(prefs?.communities ?? [])) bump(postsByCommunity, id, uid);
  }

  const rsvpsByYear = new Map<string, { unique: Set<string>; events: number }>();
  const rsvpsByStanding = new Map<string, { unique: Set<string>; events: number }>();
  const rsvpsByCommunity = new Map<string, { unique: Set<string>; events: number }>();
  const rsvpsByInterest = new Map<string, { unique: Set<string>; events: number }>();

  for (const rsvp of studentRsvps) {
    const uid = rsvp.user_id as string;
    const profile = profileById.get(uid);
    if (!profile) continue;
    const yearKey = profile.class_year != null ? String(profile.class_year) : "unknown";
    bump(rsvpsByYear, yearKey, uid);
    bump(rsvpsByStanding, deriveClassStanding(profile.class_year), uid);
    const prefs = prefsMap.get(uid);
    for (const id of normalizeInterestIds(prefs?.interests ?? [])) bump(rsvpsByInterest, id, uid);
    for (const id of normalizeCommunityIds(prefs?.communities ?? [])) bump(rsvpsByCommunity, id, uid);
  }

  // Per-event RSVP + attendance (aggregated; no PII)
  const rsvpsByEvent = new Map<string, { unique: Set<string>; total: number }>();
  for (const rsvp of studentRsvps) {
    const eid = rsvp.event_id as string;
    let entry = rsvpsByEvent.get(eid);
    if (!entry) {
      entry = { unique: new Set(), total: 0 };
      rsvpsByEvent.set(eid, entry);
    }
    entry.unique.add(rsvp.user_id as string);
    entry.total += 1;
  }
  const attendanceByEvent = attendance.byEvent;

  const eventSummaries = (events ?? [])
    .map((ev) => {
      const id = ev.id as string;
      const rsvp = rsvpsByEvent.get(id);
      const attend = attendanceByEvent.get(id);
      if (!rsvp && !attend) return null;

      const rsvpUsers = Array.from(rsvp?.unique ?? []);
      const yearDist = new Map<string, { unique: Set<string>; events: number }>();
      const communityDist = new Map<string, { unique: Set<string>; events: number }>();
      const interestDist = new Map<string, { unique: Set<string>; events: number }>();
      for (const uid of rsvpUsers) {
        const profile = profileById.get(uid);
        if (!profile) continue;
        const yearKey = profile.class_year != null ? String(profile.class_year) : "unknown";
        bump(yearDist, yearKey, uid);
        const prefs = prefsMap.get(uid);
        for (const cid of normalizeCommunityIds(prefs?.communities ?? [])) bump(communityDist, cid, uid);
        for (const iid of normalizeInterestIds(prefs?.interests ?? [])) bump(interestDist, iid, uid);
      }

      const uniqueRsvp = rsvp?.unique.size ?? 0;
      const insightParts: string[] = [];
      if (uniqueRsvp > 0) {
        insightParts.push(`${uniqueRsvp} student${uniqueRsvp === 1 ? "" : "s"} RSVP'd to this event.`);
        const standingCounts = new Map<ClassStandingId, number>();
        for (const uid of rsvpUsers) {
          const profile = profileById.get(uid);
          if (!profile) continue;
          const s = deriveClassStanding(profile.class_year);
          standingCounts.set(s, (standingCounts.get(s) ?? 0) + 1);
        }
        const frosh = standingCounts.get("freshman") ?? 0;
        if (uniqueRsvp >= 5 && frosh > 0) {
          const pct = Math.round((frosh / uniqueRsvp) * 100);
          insightParts.push(`${pct}% were first-year students.`);
        }
        const topCommunities = Array.from(communityDist.entries())
          .map(([k, v]) => ({ k, n: v.unique.size, label: communityLabel(k) }))
          .filter((x) => x.n >= 5)
          .sort((a, b) => b.n - a.n)
          .slice(0, 2);
        if (topCommunities.length > 0) {
          insightParts.push(
            `${topCommunities.map((c) => c.label).join(" and ")} were the strongest represented communities.`,
          );
        }
      }

      return {
        eventId: id,
        title: (ev.title as string) ?? "Event",
        startsAt: (ev.starts_at as string) ?? null,
        uniqueViewers: null as number | null, // event views not tracked yet
        totalRsvps: rsvp?.total ?? 0,
        uniqueRsvps: uniqueRsvp,
        verifiedAttendees: hasVerifiedAttendanceSignal ? (attend?.uniqueUserIds.size ?? 0) : null,
        totalVerifiedCheckIns: hasVerifiedAttendanceSignal ? (attend?.scanCount ?? 0) : null,
        byGraduationYear: toCohortRows(yearDist, (k) => (k === "unknown" ? "Unknown" : k)),
        byCommunity: toCohortRows(communityDist, communityLabel),
        byInterest: toCohortRows(interestDist, interestLabel),
        insight: insightParts.length > 0 ? insightParts.join(" ") : null,
      };
    })
    .filter(Boolean)
    .slice(0, 40);

  const posterCount = uniquePosters.size || 1;
  const postingByStanding = toCohortRows(postsByStanding, (k) => classStandingLabel(k as ClassStandingId)).map(
    (row) => ({
      ...row,
      percentOfActivePosters:
        row.suppressed || row.uniqueStudents == null
          ? null
          : Math.round((row.uniqueStudents / posterCount) * 1000) / 10,
    }),
  );

  return {
    range,
    notes: {
      cohortOverlap:
        "Interest and community cohort totals may overlap when a student belongs to multiple cohorts. They do not sum to the unique total.",
      attendance:
        hasVerifiedAttendanceSignal
          ? "Verified attendees are unique students with a successful scan of an event check-in QR (type=event or qr_type=event_check_in) linked to that event. Quest and location QRs never count. RSVPs never count."
          : "Verified event attendance is unavailable (QR tables missing). Showing RSVP engagement only.",
      eventViews: "Event discover/view tracking is not implemented; unique viewers are null.",
      smallCohortSuppression: "Demographic breakdowns with fewer than 5 unique students are suppressed.",
      analyticsExclusion:
        "Accounts flagged is_test_user, is_hidden, is_internal_tester, or role qa/beta_internal are excluded from all metrics.",
    },
    metrics: {
      activeStudents: activeStudents.length,
      studentsPosting: uniquePosters.size,
      postsCreated: studentPosts.length,
      eventRsvps: studentRsvps.length,
      uniqueEventRsvpers: uniqueRsvpers.size,
      verifiedEventAttendees: hasVerifiedAttendanceSignal
        ? attendance.uniqueAttendeeUserIds.size
        : null,
      onboardingCompletionRate,
      totalStudents: profiles.length,
      onboardedStudents: onboarded,
    },
    studentMakeup: {
      byGraduationYear: toCohortRows(yearMap, (k) => (k === "unknown" ? "Unknown" : k)),
      byClassStanding: toCohortRows(standingMap, (k) => classStandingLabel(k as ClassStandingId)),
      byCommunity: toCohortRows(communityMakeup, communityLabel),
      byInterest: toCohortRows(interestMakeup, interestLabel),
    },
    posting: {
      byGraduationYear: toCohortRows(postsByYear, (k) => (k === "unknown" ? "Unknown" : k)),
      byClassStanding: postingByStanding,
      byCommunity: toCohortRows(postsByCommunity, communityLabel),
      byInterest: toCohortRows(postsByInterest, interestLabel),
    },
    rsvpEngagement: {
      byGraduationYear: toCohortRows(rsvpsByYear, (k) => (k === "unknown" ? "Unknown" : k)),
      byClassStanding: toCohortRows(rsvpsByStanding, (k) => classStandingLabel(k as ClassStandingId)),
      byCommunity: toCohortRows(rsvpsByCommunity, communityLabel),
      byInterest: toCohortRows(rsvpsByInterest, interestLabel),
    },
    events: eventSummaries,
    hasVerifiedAttendanceSignal,
  };
}
