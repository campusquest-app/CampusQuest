import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ANONYMOUS_NOTICE_VERSION,
  ANONYMOUS_STUDENT_NAME,
  anonymousAuthorPresentation,
  anonymousNoticeSatisfied,
  anonymousPostRequestError,
  anonymousStoragePath,
  storagePathRevealsAccount,
} from "@/lib/anonymousPost";
import {
  anonymousPostListGeneration,
  invalidateAnonymousPostList,
  isCurrentAnonymousPostList,
} from "@/lib/client/anonymousPostList";

const root = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");
const migration = read("supabase/migrations/20261029180000_anonymous_posts.sql");
const createRoute = read("app/api/quad/posts/route.ts");
const patchRoute = read("app/api/quad/posts/[postId]/route.ts");
const privateRoute = read("app/api/me/quad/anonymous-posts/route.ts");
const noticeRoute = read("app/api/me/anonymous-posting/route.ts");
const blockRoute = read("app/api/social/blocks/anonymous-post/route.ts");
const moderationRoute = read("app/api/moderation/quad/posts/[postId]/author/route.ts");
const composer = read("components/FieldNoteComposer.tsx");
const profilePage = read("components/profile/ProfileSocialPage.tsx");
const card = read("components/FieldNoteCard.tsx");
const comments = read("components/posts/PostCommentsSheet.tsx");
const store = read("lib/store.ts");

const authors: { post_id: string; user_id: string }[] = [];
let noticeVersion: number | null = null;

vi.mock("@/lib/server/supabase", () => ({
  createAdminClient: () => ({
    from: () => {
      let userId: unknown = null;
      const builder = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          if (column === "user_id") userId = value;
          return builder;
        },
        in: async (_column: string, ids: string[]) => ({
          data: authors.filter((row) => row.user_id === userId && ids.includes(row.post_id)),
          error: null,
        }),
        maybeSingle: async () => ({
          data: noticeVersion == null ? null : { version: noticeVersion },
          error: null,
        }),
      };
      return builder;
    },
  }),
}));

describe("named and anonymous request rules", () => {
  it("leaves named posts unrestricted by the anonymous scope checks", () => {
    expect(
      anonymousPostRequestError({
        anonymous: false,
        feedDestination: "organizations",
        visibility: "friends",
        postedAsType: "organization",
        tagCount: 2,
      }),
    ).toBeNull();
  });

  it("rejects anonymous posts outside the Campus Feed, Following audience, org identity, and tags", () => {
    expect(anonymousPostRequestError({ anonymous: true, feedDestination: "organizations" })).toMatch(/Campus Feed/);
    expect(anonymousPostRequestError({ anonymous: true, visibility: "friends" })).toMatch(/Campus Feed/);
    expect(anonymousPostRequestError({ anonymous: true, postedAsType: "organization" })).toMatch(/organization/);
    expect(anonymousPostRequestError({ anonymous: true, mentionCount: 1 })).toMatch(/tag or mention/);
    expect(anonymousPostRequestError({ anonymous: true, feedDestination: "campus", visibility: "public" })).toBeNull();
  });
});

describe("anonymity notice", () => {
  it("accepts only the current version", () => {
    expect(anonymousNoticeSatisfied(null)).toBe(false);
    expect(anonymousNoticeSatisfied(0)).toBe(false);
    expect(anonymousNoticeSatisfied(ANONYMOUS_NOTICE_VERSION)).toBe(true);
    expect(anonymousNoticeSatisfied(ANONYMOUS_NOTICE_VERSION + 1)).toBe(false);
  });

  it("requires the server to store the current version and reject a mismatched client version", () => {
    expect(noticeRoute).toContain("body?.version !== ANONYMOUS_NOTICE_VERSION");
    expect(noticeRoute).toContain("acceptAnonymousNotice");
    const notice = read("components/posts/AnonymousPostNotice.tsx");
    expect(notice).toContain("I understand — continue");
    expect(notice).toContain("Anonymous doesn’t mean unaccountable");
    expect(notice).toContain("LEGAL_DOC_LINKS.guidelines");
    expect(composer).toContain("setNoticeOpen(false)");
    expect(composer).toContain("setAnonymousMode(false)");
  });
});

describe("composer identity", () => {
  it("defaults to the personal profile and keeps the draft while switching", () => {
    expect(composer).toContain("useState(false)");
    expect(composer).toContain('title: "Post anonymously"');
    const option = composer.slice(composer.indexOf('title: "Post anonymously"'), composer.indexOf("onSelect={(identity)"));
    expect(option).not.toContain("setBody");
    expect(option).not.toContain("setCarouselItems");
  });

  it("restores the personal identity when the feed cannot host an anonymous post", () => {
    expect(composer).toContain("Anonymous posts are only available in the Campus Feed");
    expect(composer).toContain("Your draft is still here.");
    expect(composer).toContain("ANONYMOUS_ACCOUNTABILITY_LINE");
    expect(composer).toContain("ANONYMOUS_IDENTITY_HINT");
  });
});

describe("public presentation", () => {
  it("uses a generic author and never a real account id", () => {
    const presented = anonymousAuthorPresentation(false);
    expect(presented.authorName).toBe(ANONYMOUS_STUDENT_NAME);
    expect(presented.authorId).toBe("");
    expect(presented.authorUsername).toBe("");
    expect(presented.authorVerifiedBadge).toBe(false);
    expect(anonymousAuthorPresentation(true).viewerIsAuthor).toBe(true);
  });

  it("keeps media paths out of account folders", () => {
    const pathName = anonymousStoragePath("jpg");
    expect(pathName.startsWith("anon/")).toBe(true);
    expect(storagePathRevealsAccount(pathName, "11111111-1111-1111-1111-111111111111")).toBe(false);
    expect(storagePathRevealsAccount("11111111-1111-1111-1111-111111111111/posts/a.jpg", "11111111-1111-1111-1111-111111111111")).toBe(true);
  });

  it("shows the owner indicator without a profile link, and comments stay named", () => {
    expect(card).toContain("Your anonymous post");
    expect(card).toContain("note.viewerIsAuthor === true");
    expect(card).toContain("Block account");
    expect(card).toContain("isOwner && !isAnonymousPost");
    expect(comments).toContain("ANONYMOUS_COMMENT_COPY");
    expect(comments).not.toMatch(/\bOP\b/);
  });
});

describe("database privacy boundary", () => {
  it("stores authorship in a revoked table and nulls the public author", () => {
    expect(migration).toContain("revoke all on table public.quad_anonymous_authors from public, anon, authenticated");
    expect(migration).toContain("revoke all on table public.anonymous_account_blocks from public, anon, authenticated");
    expect(migration).toContain("new.user_id := null");
    expect(migration).toContain("raise exception 'ANONYMITY_IMMUTABLE'");
    expect(migration).toContain("trg_zz_anonymous_post_privacy");
    expect(migration).not.toMatch(/grant select on table public\.quad_anonymous_authors/i);
    expect(migration).toContain("returns table (id uuid, created_at timestamptz)");
    expect(migration).toContain("revoke select (post_owner_id)");
    expect(migration).toContain("is_anonymous boolean not null default false");
  });

  it("does not grant a function that returns an author id to authenticated users", () => {
    expect(migration).not.toMatch(/returns\s+uuid[\s\S]{0,200}grant execute/i);
    expect(migration).toContain("returns boolean");
  });
});

describe("server enforcement", () => {
  it("checks eligibility, notice, campus scope, and rate limits only for anonymous creates", () => {
    const gate = createRoute.slice(createRoute.indexOf("const anonymous = input.anonymous === true"));
    expect(gate).toContain("anonymousPostRequestError");
    expect(gate).toContain("assertAccountCanSocialize");
    expect(gate).toContain("requireVerifiedSchoolForCoreAccess");
    expect(gate).toContain("assertAnonymousNoticeAccepted");
    expect(gate).toContain('visibility = anonymous ? "public"');
    expect(gate).toContain('feedDestination = anonymous ? "campus"');
    expect(gate).toContain("relocateAnonymousPostMedia");
    expect(gate).toContain("if (!anonymous && shouldCreateRealmMoment");
    expect(createRoute).toContain('.eq("is_anonymous", false)');
  });

  it("rejects an edit that would change an anonymous post to Following", () => {
    expect(patchRoute).toContain("ANONYMITY_IMMUTABLE");
    expect(patchRoute).toContain("presentAnonymousQuadPosts");
    expect(read("lib/server/validation.ts")).not.toContain("is_anonymous:");
  });

  it("keeps anonymous posts out of Following, profiles, activity, and tagged grids", () => {
    expect(read("lib/server/quadFriendsFeed.ts")).toContain('.eq("is_anonymous", false)');
    expect(read("lib/server/userProfileView.ts")).toContain('.eq("is_anonymous", false)');
    expect(read("lib/server/userActivityEvents.ts")).toContain('.eq("is_anonymous", false)');
    expect(read("app/api/me/quad/posts/route.ts")).toContain('.eq("is_anonymous", false)');
    expect(read("app/api/quad/tagged/[entityType]/[entityId]/route.ts")).toContain("!p.is_anonymous");
    expect(read("app/api/quad/posts/[postId]/tags/route.ts")).toContain("post.is_anonymous");
  });
});

describe("owner-only private list", () => {
  it("derives the author from the session and hides the filter from other viewers", () => {
    expect(privateRoute).toContain('.eq("user_id", auth.user.id)');
    expect(privateRoute).not.toContain('searchParams.get("userId")');
    expect(privateRoute).toContain("presentAnonymousQuadPosts");
    expect(profilePage).toContain("includeAnonymous={isOwner}");
    expect(profilePage).toContain('if (!isOwner && tab === "anonymous") setTab("posts")');
    expect(profilePage).toContain("Only you can see this section");
    expect(profilePage).toContain("invalidateAnonymousPostList");
  });

  it("drops a stale private list after logout or an account change", () => {
    const started = anonymousPostListGeneration();
    expect(isCurrentAnonymousPostList(started)).toBe(true);
    invalidateAnonymousPostList();
    expect(isCurrentAnonymousPostList(started)).toBe(false);
    expect(store).toContain("invalidateAnonymousPostList");
    expect(read("lib/client/quadPostsClient.ts")).toContain("stale: true");
    expect(profilePage).toContain("result.stale");
  });
});

describe("blocking, reporting, and moderation", () => {
  it("blocks from the post id and returns no account id", () => {
    expect(blockRoute).toContain("blockAnonymousPostAuthor");
    expect(blockRoute).toContain("blockId: block.blockId");
    expect(blockRoute).not.toContain("blockedUserId");
    expect(blockRoute).toContain("Their profile is not shown");
    expect(read("lib/server/anonymousPosts.ts")).toContain('displayName: "Anonymous account"');
    expect(read("lib/server/messaging.ts")).toContain("listAnonymousBlocksForViewer");
  });

  it("limits author lookup to the moderation admin check and audits it", () => {
    expect(moderationRoute).toContain("assertPlatformModerationAdminEmail");
    expect(moderationRoute).toContain("auditAnonymousAuthorLookup");
    expect(read("lib/server/anonymousPosts.ts")).toContain('actionType: "anonymous_post_author_lookup"');
  });
});

describe("presented feed rows", () => {
  beforeEach(() => {
    authors.length = 0;
    noticeVersion = null;
  });

  it("strips the author for another viewer and marks ownership only for the author", async () => {
    const { presentAnonymousQuadPosts, assertAnonymousNoticeAccepted } = await import("@/lib/server/anonymousPosts");
    authors.push({ post_id: "post-1", user_id: "author-1" });
    const row = {
      id: "post-1",
      user_id: "author-1",
      is_anonymous: true,
      body: "hello",
      profiles: { id: "author-1", username: "real", display_name: "Real Name" },
      media_storage_path: "author-1/posts/a.jpg",
    };
    const [hidden] = await presentAnonymousQuadPosts([row as never], "someone-else");
    const hiddenRow = hidden as unknown as {
      user_id: string;
      viewer_is_author: boolean;
      profiles: unknown;
      media_storage_path: string | null;
    };
    expect(hiddenRow.user_id).toBe("");
    expect(hiddenRow.viewer_is_author).toBe(false);
    expect(hiddenRow.profiles).toBeNull();
    expect(hiddenRow.media_storage_path).toBeNull();
    expect(JSON.stringify(hidden)).not.toContain("author-1");
    expect(JSON.stringify(hidden)).not.toContain("Real Name");

    const [owned] = await presentAnonymousQuadPosts([row as never], "author-1");
    const ownedRow = owned as unknown as { viewer_is_author: boolean; user_id: string };
    expect(ownedRow.viewer_is_author).toBe(true);
    expect(ownedRow.user_id).toBe("");
    expect(JSON.stringify(owned)).not.toContain("author-1");

    noticeVersion = null;
    await expect(assertAnonymousNoticeAccepted("author-1")).rejects.toMatchObject({
      code: "ANONYMOUS_NOTICE_REQUIRED",
    });
    noticeVersion = ANONYMOUS_NOTICE_VERSION;
    await expect(assertAnonymousNoticeAccepted("author-1")).resolves.toBeUndefined();
  });
});
