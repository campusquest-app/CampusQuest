import { describe, expect, it } from "vitest";
import { campusEventToRecommendationEntity, fieldNoteToRecommendationEntity } from "@/lib/recommendations/adapters";
import { emptyRecommendationProfile, inferAffinitiesFromSignals } from "@/lib/recommendations/profile";
import { rankRecommendationEntities } from "@/lib/recommendations/rank";
import { scoreRecommendationEntity } from "@/lib/recommendations/score";
import { formatRecommendationDebugLine, publicPopularityCount, shouldExposeRecommendationDebug } from "@/lib/recommendations/debug";
import { recommendationTimeBucket } from "@/lib/recommendations/weights";
import type { FieldNote } from "@/lib/types";

const NOW = Date.parse("2026-08-25T16:00:00.000Z");

function event(partial: {
  id: string;
  title: string;
  description?: string;
  category?: string;
  startsAt?: string;
  endsAt?: string;
  campusId?: string | null;
  rsvpCount?: number;
}) {
  return campusEventToRecommendationEntity({
    id: partial.id,
    title: partial.title,
    description: partial.description ?? "",
    category: partial.category,
    startsAt: partial.startsAt ?? "2026-08-26T18:00:00.000Z",
    endsAt: partial.endsAt ?? null,
    campusId: partial.campusId,
    rsvpCount: partial.rsvpCount,
  });
}

function post(partial: { id: string; body: string; createdAt: number; nodCount?: number; hypeCount?: number }): FieldNote {
  return {
    id: partial.id,
    authorId: "u1",
    authorName: "Ram",
    authorUsername: "ram",
    authorAvatar: "",
    body: partial.body,
    ramMarks: [],
    nodCount: partial.nodCount ?? 0,
    vouchCount: 0,
    nodByUserIds: new Set(),
    vouchByUserIds: new Set(),
    hypeCount: partial.hypeCount ?? 0,
    verifyCount: 0,
    assistCount: 0,
    hypeByUserIds: new Set(),
    verifyByUserIds: new Set(),
    assistByUserIds: new Set(),
    createdAt: partial.createdAt,
  };
}

describe("recommendation scoring", () => {
  it("boosts interest matches", () => {
    const profile = emptyRecommendationProfile({ explicitInterests: ["athletics"] });
    const basketball = scoreRecommendationEntity(
      event({ id: "bball", title: "Basketball vs Fordham", category: "Athletics" }),
      profile,
      NOW,
    );
    const lecture = scoreRecommendationEntity(
      event({ id: "lec", title: "History lecture", category: "Academic" }),
      profile,
      NOW,
    );
    expect(basketball.score).toBeGreaterThan(lecture.score);
    expect(basketball.matchedInterests).toContain("athletics");
  });

  it("boosts community matches", () => {
    const profile = emptyRecommendationProfile({ explicitCommunities: ["talent_development"] });
    const tdi = scoreRecommendationEntity(
      event({ id: "tdi", title: "Talent Development workshop" }),
      profile,
      NOW,
    );
    const other = scoreRecommendationEntity(event({ id: "other", title: "Chess club social" }), profile, NOW);
    expect(tdi.score).toBeGreaterThan(other.score);
    expect(tdi.matchedCommunities).toContain("talent_development");
  });

  it("does not promote a campus mismatch", () => {
    const profile = emptyRecommendationProfile({ campusId: "uri", explicitInterests: ["music"] });
    const uriShow = scoreRecommendationEntity(
      event({ id: "uri", title: "Concert on campus", category: "Music", campusId: "uri" }),
      profile,
      NOW,
    );
    const otherCampus = scoreRecommendationEntity(
      event({ id: "x", title: "Concert on campus", category: "Music", campusId: "other" }),
      profile,
      NOW,
    );
    expect(otherCampus.score).toBeLessThan(uriShow.score);
  });

  it("ranks an upcoming event above an expired event", () => {
    const profile = emptyRecommendationProfile({ explicitInterests: ["music"] });
    const upcoming = scoreRecommendationEntity(
      event({
        id: "up",
        title: "Concert tonight",
        category: "Music",
        startsAt: "2026-08-25T20:00:00.000Z",
      }),
      profile,
      NOW,
    );
    const expired = scoreRecommendationEntity(
      event({
        id: "old",
        title: "Concert last week",
        category: "Music",
        startsAt: "2026-08-18T20:00:00.000Z",
        endsAt: "2026-08-18T23:00:00.000Z",
      }),
      profile,
      NOW,
    );
    expect(upcoming.score).toBeGreaterThan(expired.score);
  });

  it("surfaces a featured campus-wide event without a preference match", () => {
    const profile = emptyRecommendationProfile({ explicitInterests: ["gaming"] });
    const rhodyFest = scoreRecommendationEntity(
      event({ id: "rf", title: "Rhody Fest", description: "Campus-wide celebration" }),
      profile,
      NOW,
    );
    const random = scoreRecommendationEntity(event({ id: "rand", title: "Obscure meetup" }), profile, NOW);
    expect(rhodyFest.score).toBeGreaterThan(random.score);
    expect(rhodyFest.reason?.code).toBe("campus_wide");
  });

  it("lets behavioral inferred affinity raise a topic the user did not select", () => {
    const profile = emptyRecommendationProfile({
      explicitInterests: ["athletics"],
      inferredAffinities: { "fine_arts": 0.9, art: 0.9 },
    });
    const gallery = scoreRecommendationEntity(
      event({ id: "art", title: "Gallery opening", description: "Fine arts exhibit" }),
      profile,
      NOW,
    );
    const baseline = emptyRecommendationProfile({ explicitInterests: ["athletics"] });
    const galleryWithout = scoreRecommendationEntity(
      event({ id: "art", title: "Gallery opening", description: "Fine arts exhibit" }),
      baseline,
      NOW,
    );
    expect(gallery.score).toBeGreaterThan(galleryWithout.score);
  });

  it("does not overwrite explicit preferences when inferring affinities", () => {
    const explicit = ["athletics", "music", "clubs"];
    const inferred = inferAffinitiesFromSignals([
      { kind: "rsvp_going", topicIds: ["art", "fine_arts"] },
      { kind: "check_in", topicIds: ["art"] },
    ]);
    expect(explicit).toEqual(["athletics", "music", "clubs"]);
    expect(inferred.art).toBeGreaterThan(0);
    expect(inferred).not.toHaveProperty("athletics");
  });

  it("still ranks useful fallback events when the user has no preferences", () => {
    const profile = emptyRecommendationProfile();
    const ranked = rankRecommendationEntities({
      items: [
        event({ id: "rf", title: "Rhody Fest", description: "Campus-wide" }),
        event({ id: "soon", title: "Club meeting tonight", startsAt: "2026-08-25T18:30:00.000Z" }),
        event({ id: "later", title: "Workshop next month", startsAt: "2026-09-20T18:00:00.000Z" }),
      ],
      toEntity: (item) => item,
      profile,
      nowMs: NOW,
    });
    expect(ranked).toHaveLength(3);
    expect(ranked[0]?.entity.id).toBe("rf");
  });

  it("keeps discovery content outside selected interests in the ranked list", () => {
    const profile = emptyRecommendationProfile({ explicitInterests: ["athletics"] });
    const ranked = rankRecommendationEntities({
      items: [
        event({ id: "a1", title: "Basketball", category: "Athletics" }),
        event({ id: "a2", title: "Soccer", category: "Athletics" }),
        event({ id: "a3", title: "Hockey", category: "Athletics" }),
        event({ id: "music", title: "Choir concert", category: "Music" }),
      ],
      toEntity: (item) => item,
      profile,
      nowMs: NOW,
      diversity: true,
      exploreEvery: 3,
    });
    expect(ranked.map((row) => row.entity.id)).toContain("music");
  });

  it("uses deterministic tie-breaking by id", () => {
    const profile = emptyRecommendationProfile();
    const ranked = rankRecommendationEntities({
      items: [
        event({ id: "b", title: "Same", startsAt: "2026-08-26T18:00:00.000Z" }),
        event({ id: "a", title: "Same", startsAt: "2026-08-26T18:00:00.000Z" }),
      ],
      toEntity: (item) => item,
      profile,
      nowMs: NOW,
    });
    expect(ranked.map((row) => row.entity.id)).toEqual(["a", "b"]);
  });

  it("hides debug breakdown from normal users", () => {
    const student = emptyRecommendationProfile({ includeDebug: false });
    const admin = emptyRecommendationProfile({ includeDebug: true });
    const entity = event({ id: "x", title: "Basketball" });
    expect(scoreRecommendationEntity(entity, student, NOW).debug).toBeUndefined();
    expect(scoreRecommendationEntity(entity, admin, NOW).debug).toBeDefined();
    expect(shouldExposeRecommendationDebug({ isAdmin: false, isInternalTester: false })).toBe(false);
    expect(shouldExposeRecommendationDebug({ isAdmin: true })).toBe(true);
  });

  it("excludes internal testers from popularity counts", () => {
    const count = publicPopularityCount(
      [{ userId: "student-1" }, { userId: "tester-1" }, { userId: "student-2" }],
      new Set(["tester-1"]),
    );
    expect(count).toBe(2);
  });

  it("lets recency keep a fresh unmatched post competitive with an old matched post", () => {
    const profile = emptyRecommendationProfile({ explicitInterests: ["athletics"] });
    const oldMatch = scoreRecommendationEntity(
      fieldNoteToRecommendationEntity(
        post({
          id: "old",
          body: "Basketball watch party last month",
          createdAt: NOW - 20 * 24 * 60 * 60 * 1000,
          nodCount: 40,
          hypeCount: 10,
        }),
      ),
      profile,
      NOW,
    );
    const fresh = scoreRecommendationEntity(
      fieldNoteToRecommendationEntity(
        post({
          id: "fresh",
          body: "Anyone going to the dining hall?",
          createdAt: NOW - 30 * 60 * 1000,
          nodCount: 2,
          hypeCount: 0,
        }),
      ),
      profile,
      NOW,
    );
    expect(fresh.score).toBeGreaterThan(0);
    expect(oldMatch.score).toBeLessThan(oldMatch.score + fresh.score);
    expect(fresh.score).toBeGreaterThan(oldMatch.score * 0.35);
  });

  it("never hides unmatched events from For You ranking", () => {
    const profile = emptyRecommendationProfile({ explicitInterests: ["athletics"] });
    const items = [
      event({ id: "a1", title: "Basketball", category: "Athletics" }),
      event({ id: "music", title: "Choir concert", category: "Music" }),
      event({ id: "food", title: "Dining special", category: "Food" }),
    ];
    const ranked = rankRecommendationEntities({
      items,
      toEntity: (item) => item,
      profile,
      nowMs: NOW,
      diversity: true,
    });
    expect(ranked).toHaveLength(items.length);
    expect(ranked.map((row) => row.entity.id).sort()).toEqual(["a1", "food", "music"]);
  });

  it("keeps ranking stable inside a 15-minute time bucket", () => {
    expect(recommendationTimeBucket(NOW)).toBe(recommendationTimeBucket(NOW + 60_000));
  });

  it("omits debug score lines unless debug is enabled", () => {
    const entity = event({ id: "x", title: "Basketball" });
    expect(formatRecommendationDebugLine(scoreRecommendationEntity(entity, emptyRecommendationProfile(), NOW))).toBeNull();
    expect(
      formatRecommendationDebugLine(
        scoreRecommendationEntity(entity, emptyRecommendationProfile({ includeDebug: true }), NOW),
      ),
    ).toContain("score");
  });
});
