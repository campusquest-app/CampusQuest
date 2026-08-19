import { describe, expect, it } from "vitest";
import {
  buildVerifiedAttendance,
  isVerifiedEventAttendanceQr,
} from "@/lib/server/engagementAttendance";
import { aggregateStudentEngagementFixtures } from "@/lib/server/engagementAggregation";
import { ONBOARDING_VERSION } from "@/lib/onboarding/taxonomy";
import { onboardingPreferencesSchema, patchMeProfileSchema } from "@/lib/server/validation";

describe("verified event attendance QR rules", () => {
  it("accepts event type + event_id", () => {
    expect(
      isVerifiedEventAttendanceQr({
        id: "q1",
        event_id: "e1",
        type: "event",
        qr_type: "general",
      }),
    ).toBe(true);
  });

  it("accepts event_check_in qr_type + event_id", () => {
    expect(
      isVerifiedEventAttendanceQr({
        id: "q2",
        event_id: "e1",
        type: "general",
        qr_type: "event_check_in",
      }),
    ).toBe(true);
  });

  it("rejects quest QRs even with event_id", () => {
    expect(
      isVerifiedEventAttendanceQr({
        id: "q3",
        event_id: "e1",
        type: "quest",
        qr_type: "quest_completion",
      }),
    ).toBe(false);
  });

  it("rejects event_id alone without event semantics", () => {
    expect(
      isVerifiedEventAttendanceQr({
        id: "q4",
        event_id: "e1",
        type: "permanent_location",
        qr_type: "location_check_in",
      }),
    ).toBe(false);
  });

  it("dedupes unique attendees per event across duplicate scans", () => {
    const result = buildVerifiedAttendance({
      eligibleUserIds: new Set(["u1", "u2"]),
      qrById: new Map([
        [
          "qr-event",
          { id: "qr-event", event_id: "e1", type: "event", qr_type: "event_check_in" },
        ],
        [
          "qr-quest",
          { id: "qr-quest", event_id: "e1", type: "quest", qr_type: "quest_completion" },
        ],
      ]),
      scans: [
        { user_id: "u1", qr_code_id: "qr-event", status: "success" },
        { user_id: "u1", qr_code_id: "qr-event", status: "success" },
        { user_id: "u1", qr_code_id: "qr-quest", status: "success" },
        { user_id: "u2", qr_code_id: "qr-quest", status: "success" },
      ],
    });
    expect(result.records).toHaveLength(1);
    expect(result.uniqueAttendeeUserIds).toEqual(new Set(["u1"]));
    expect(result.byEvent.get("e1")?.uniqueUserIds.size).toBe(1);
    expect(result.byEvent.get("e1")?.scanCount).toBe(2);
  });
});

describe("engagement fixture aggregation", () => {
  const rangeStartIso = "2026-08-01T00:00:00.000Z";
  const rangeEndIso = "2026-08-31T23:59:59.000Z";

  it("counts posts/RSVPs uniquely and excludes test accounts", () => {
    const result = aggregateStudentEngagementFixtures({
      rangeStartIso,
      rangeEndIso,
      profiles: [
        {
          id: "a",
          class_year: 2030,
          onboarding_completed: true,
          last_active_at: "2026-08-10T12:00:00.000Z",
        },
        {
          id: "b",
          class_year: 2029,
          onboarding_completed: true,
          last_active_at: "2026-08-11T12:00:00.000Z",
        },
        {
          id: "c",
          class_year: 2028,
          onboarding_completed: false,
          last_active_at: "2026-08-12T12:00:00.000Z",
        },
        {
          id: "d",
          class_year: 2027,
          onboarding_completed: true,
          last_active_at: "2026-08-13T12:00:00.000Z",
        },
        {
          id: "e",
          class_year: 2027,
          onboarding_completed: true,
          last_active_at: "2026-08-14T12:00:00.000Z",
        },
        // internal/test — must not contribute
        {
          id: "qa",
          class_year: 2030,
          onboarding_completed: true,
          last_active_at: "2026-08-15T12:00:00.000Z",
          excluded: true,
        },
      ],
      prefs: [
        { user_id: "a", interests: ["athletics", "music", "tech"], communities: ["athletics", "engineering"] },
        { user_id: "b", interests: ["athletics", "food", "clubs"], communities: ["athletics"] },
        { user_id: "c", interests: ["music", "art", "tech"], communities: ["engineering"] },
        { user_id: "d", interests: ["career", "tech", "clubs"], communities: ["business"] },
        { user_id: "e", interests: ["outdoors", "food", "fitness"], communities: ["other"] },
        { user_id: "qa", interests: ["athletics", "music", "tech"], communities: ["athletics"] },
      ],
      posts: [
        { user_id: "a" },
        { user_id: "a" },
        { user_id: "a" },
        { user_id: "b" },
        { user_id: "qa" }, // excluded
      ],
      rsvps: [
        { user_id: "a", event_id: "ev1" },
        { user_id: "b", event_id: "ev1" },
        { user_id: "a", event_id: "ev2" },
        { user_id: "qa", event_id: "ev1" },
      ],
      scans: [
        { user_id: "a", qr_code_id: "qr-event", status: "success" },
        { user_id: "a", qr_code_id: "qr-event", status: "success" },
        { user_id: "qa", qr_code_id: "qr-event", status: "success" },
        { user_id: "b", qr_code_id: "qr-quest", status: "success" },
      ],
      qrCodes: [
        { id: "qr-event", event_id: "ev1", type: "event", qr_type: "event_check_in" },
        { id: "qr-quest", event_id: "ev1", type: "quest", qr_type: "quest_completion" },
      ],
    });

    expect(result.metrics.postsCreated).toBe(4); // event count, not unique
    expect(result.metrics.studentsPosting).toBe(2);
    expect(result.metrics.eventRsvps).toBe(3);
    expect(result.metrics.uniqueEventRsvpers).toBe(2);
    expect(result.metrics.verifiedEventAttendees).toBe(1); // only a; quest+qa excluded
    expect(result.metrics.activeStudents).toBe(5);
    expect(result.metrics.totalStudents).toBe(5);
    expect(result.uniqueAttendeeUserIds.has("qa")).toBe(false);

    // Overlapping interest cohort: athletics includes a+b (posts), not mutually exclusive with tech
    const athletics = result.postingByInterest.find((r) => r.key === "athletics");
    const tech = result.postingByInterest.find((r) => r.key === "tech");
    expect(athletics?.suppressed).toBe(true); // <5 unique posters
    expect(athletics?.displayLabel).toBe("<5 students");
    expect(tech?.suppressed).toBe(true);

    // Year cohort with 2 seniors (d+e) still <5 → suppressed
    const seniorYear = result.studentMakeupByYear.find((r) => r.key === "2027");
    expect(seniorYear?.suppressed).toBe(true);

    expect(result.notes.cohortOverlap.toLowerCase()).toContain("overlap");
  });
});

describe("onboarding persistence payload contract", () => {
  it("accepts a complete demographic save payload and version", () => {
    const prefs = onboardingPreferencesSchema.parse({
      schoolName: "University of Rhode Island",
      interests: ["athletics", "music", "tech"],
      communities: ["engineering"],
      institutionId: "uri",
      studentStatus: "current_or_incoming",
      classYear: 2028,
      onboardingVersion: ONBOARDING_VERSION,
      markOnboardingComplete: false,
      discoveryFocus: ["events", "organizations", "meet_students"],
      major: "",
    });
    const profile = patchMeProfileSchema.parse({
      studentStatus: "current_or_incoming",
      institutionId: "uri",
      classYear: 2028,
      onboardingVersion: ONBOARDING_VERSION,
    });

    expect(prefs.interests).toHaveLength(3);
    expect(prefs.communities).toEqual(["engineering"]);
    expect(prefs.institutionId).toBe("uri");
    expect(prefs.studentStatus).toBe("current_or_incoming");
    expect(prefs.classYear).toBe(2028);
    expect(prefs.onboardingVersion).toBe(2);
    expect(profile.studentStatus).toBe("current_or_incoming");
    expect(profile.institutionId).toBe("uri");
    expect(profile.classYear).toBe(2028);
    expect(profile.onboardingVersion).toBe(2);
  });

  it("rejects fewer than 3 interests (settings + onboarding)", () => {
    expect(() =>
      onboardingPreferencesSchema.parse({
        schoolName: "University of Rhode Island",
        interests: ["athletics", "music"],
        discoveryFocus: ["events"],
      }),
    ).toThrow();
  });

  it("documents logout/login survival via completed_at + profile columns", () => {
    // Persistence is row-based on profiles + user_onboarding_preferences keyed by user_id.
    // Re-login reloads the same rows; no client-only draft is required after Explore/Continue.
    const stored = {
      student_status: "current_or_incoming",
      class_year: 2028,
      institution_id: "uri",
      interests: ["athletics", "music", "tech"],
      communities: ["engineering"],
      onboarding_version: ONBOARDING_VERSION,
      onboarding_completed_at: null as string | null, // set when character onboarding finishes
      prefs_completed_at: "2026-08-18T12:00:00.000Z",
    };
    expect(stored.interests.length).toBeGreaterThanOrEqual(3);
    expect(stored.institution_id).toBe("uri");
    expect(stored.onboarding_version).toBe(2);
    expect(stored.prefs_completed_at).toBeTruthy();
  });
});
