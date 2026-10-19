import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { markEmberInteraction, shouldIgnoreLikersOpen } from "@/lib/client/emberTapGuard";
import { mergeRemoteQuadPostsCache, getNoteForReaction, optimisticGiveSpark } from "@/lib/feedStore";
import type { FieldNote } from "@/lib/types";

const root = process.cwd();
const card = readFileSync(join(root, "components/FieldNoteCard.tsx"), "utf8");
const likedBy = readFileSync(join(root, "components/posts/LikedByRow.tsx"), "utf8");
const likers = readFileSync(join(root, "components/posts/PostLikersSheet.tsx"), "utf8");
const host = readFileSync(join(root, "components/embers/EmberCastHost.tsx"), "utf8");
const dashboard = readFileSync(join(root, "components/Dashboard.tsx"), "utf8");
const feed = readFileSync(join(root, "lib/feedStore.ts"), "utf8");
const css = readFileSync(join(root, "app/globals.css"), "utf8");

describe("Ember vs Likes routing", () => {
  it("opens likes from the like count or liked-by row, never from Ember", () => {
    expect(card).toContain("onCountClick={note.nodCount > 0 ? openLikers : undefined}");
    expect(card).toContain("function openLikers()");
    expect(card).toContain("shouldIgnoreLikersOpen");
    expect(card).toContain("noteId={note.id}");
    expect(likedBy).toContain("shouldIgnoreLikersOpen");
    expect(card).not.toMatch(/<EmberReactionButton[\s\S]*?onToggle=\{handleNod\}/);
    expect(card).toContain("onToggle={handleHype}");
  });

  it("suppresses delayed clicks after an Ember tap", () => {
    expect(shouldIgnoreLikersOpen()).toBe(false);
    markEmberInteraction();
    expect(shouldIgnoreLikersOpen()).toBe(true);
  });

  it("renders the Ember cast from a dashboard host, not the remounting card", () => {
    expect(dashboard).toContain("EmberCastHost");
    expect(host).toContain("Feed-level cast host");
    expect(card).not.toContain("EmberCastOverlay");
  });

  it("uses a compact list sheet for likes", () => {
    expect(likers).toContain("cq-list-sheet");
    expect(css).toContain(".cq-list-sheet");
    expect(css).toContain("min-height: 0");
    expect(css).toContain(".cq-feed-liked-by");
    expect(css).toMatch(/\.cq-feed-liked-by\s*\{[\s\S]*width:\s*auto/);
  });
});

describe("Ember cache persistence", () => {
  afterEach(() => {
    mergeRemoteQuadPostsCache([]);
  });

  it("does not let a stale feed refresh wipe a just-awarded Ember", () => {
    expect(feed).toContain("Union local + server");
    const awarded: FieldNote = {
      id: "11111111-1111-4111-8111-111111111111",
      authorId: "author-1",
      authorName: "A",
      authorUsername: "a",
      authorAvatar: "",
      body: "hi",
      ramMarks: [],
      nodCount: 0,
      vouchCount: 0,
      nodByUserIds: new Set(),
      vouchByUserIds: new Set(),
      hypeCount: 0,
      verifyCount: 0,
      assistCount: 0,
      hypeByUserIds: new Set(),
      verifyByUserIds: new Set(),
      assistByUserIds: new Set(),
      createdAt: Date.now(),
      visibility: "public",
      isPersisted: true,
    };
    mergeRemoteQuadPostsCache([awarded]);
    const cached = getNoteForReaction(awarded.id);
    expect(cached).toBeTruthy();
    if (!cached) return;
    optimisticGiveSpark(cached, "user-1");
    expect(cached.hypeByUserIds.has("user-1")).toBe(true);

    mergeRemoteQuadPostsCache([
      {
        ...awarded,
        hypeByUserIds: new Set(),
        vouchByUserIds: new Set(),
      },
    ]);
    expect(getNoteForReaction(awarded.id)?.hypeByUserIds.has("user-1")).toBe(true);
  });
});
