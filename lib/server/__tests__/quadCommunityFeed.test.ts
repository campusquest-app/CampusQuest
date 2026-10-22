import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { QUAD_COMMUNITY_FEED_LABELS } from "@/lib/quadCommunityChannels";
import { postQualifiesForCommunityChannel } from "@/lib/server/quadCommunityFeed";

const VIEWER = "viewer-1";
const AUTHOR = "author-campusquest";
const OTHER = "author-other";

function check(
  overrides: Partial<Parameters<typeof postQualifiesForCommunityChannel>[0]> & {
    post?: Partial<Parameters<typeof postQualifiesForCommunityChannel>[0]["post"]>;
  } = {},
) {
  const { post: postOverrides, ...rest } = overrides;
  return postQualifiesForCommunityChannel({
    channel: "greek_life",
    viewerId: VIEWER,
    post: {
      id: "post-1",
      user_id: AUTHOR,
      feed_destination: "campus",
      ...postOverrides,
    },
    authorIds: new Set([AUTHOR]),
    taggedPostIds: new Set(),
    postedAsPostIds: new Set(),
    hiddenAuthorIds: new Set(),
    ...rest,
  });
}

describe("postQualifiesForCommunityChannel — Greek Life", () => {
  it("excludes general campus posts even when the author opted into greek_life", () => {
    expect(check()).toBe(false);
    expect(
      check({
        authorIds: new Set([AUTHOR]),
        post: { id: "announcement", user_id: AUTHOR, feed_destination: "campus" },
      }),
    ).toBe(false);
  });

  it("includes posts that tag an FSL organization", () => {
    expect(check({ taggedPostIds: new Set(["post-1"]) })).toBe(true);
  });

  it("includes posts published as an FSL organization", () => {
    expect(
      check({
        postedAsPostIds: new Set(["post-1"]),
        post: { feed_destination: "organizations" },
      }),
    ).toBe(true);
  });

  it("never includes local-business destination posts", () => {
    expect(
      check({
        taggedPostIds: new Set(["post-1"]),
        post: { feed_destination: "local_businesses" },
      }),
    ).toBe(false);
  });

  it("hides posts from blocked authors for other viewers", () => {
    expect(
      check({
        taggedPostIds: new Set(["post-1"]),
        hiddenAuthorIds: new Set([AUTHOR]),
      }),
    ).toBe(false);
    expect(
      check({
        viewerId: AUTHOR,
        taggedPostIds: new Set(["post-1"]),
        hiddenAuthorIds: new Set([AUTHOR]),
      }),
    ).toBe(true);
  });
});

describe("postQualifiesForCommunityChannel — Athletics (unchanged membership rule)", () => {
  it("still includes campus posts from authors who opted into athletics", () => {
    expect(
      check({
        channel: "athletics",
        authorIds: new Set([AUTHOR]),
        post: { user_id: AUTHOR, feed_destination: "campus" },
      }),
    ).toBe(true);
    expect(
      check({
        channel: "athletics",
        authorIds: new Set([AUTHOR]),
        post: { user_id: OTHER, feed_destination: "campus" },
      }),
    ).toBe(false);
  });
});

describe("Greek Life feed contracts", () => {
  it("does not treat onboarding affiliation alone as Greek Life content", () => {
    const source = readFileSync(join(process.cwd(), "lib/server/quadCommunityFeed.ts"), "utf8");
    expect(source).toContain("greek_life: false");
    expect(source).toContain("CHANNEL_INCLUDES_AUTHOR_MEMBERSHIP");
    expect(source).toContain("postIdsPostedAsCommunityOrgs");
    expect(QUAD_COMMUNITY_FEED_LABELS.greek_life.emptyBody).toMatch(/tagging a Greek organization|posting as one/i);
    expect(QUAD_COMMUNITY_FEED_LABELS.greek_life.emptyBody).not.toMatch(/Greek Life students/i);
  });

  it("guards TheQuad refresh against stale cross-tab responses", () => {
    const source = readFileSync(join(process.cwd(), "components/TheQuad.tsx"), "utf8");
    expect(source).toContain("refreshGenerationRef");
    expect(source).toContain("stillCurrent");
    expect(source).toMatch(/refreshGenerationRef\.current \+= 1/);
  });
});
