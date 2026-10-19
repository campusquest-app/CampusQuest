import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const card = readFileSync(join(root, "components/FieldNoteCard.tsx"), "utf8");
const emberBtn = readFileSync(join(root, "components/embers/EmberReactionButton.tsx"), "utf8");
const quad = readFileSync(join(root, "components/TheQuad.tsx"), "utf8");
const css = readFileSync(join(root, "app/globals.css"), "utf8");
const embers = readFileSync(join(root, "lib/embers.ts"), "utf8");
const reactions = readFileSync(join(root, "lib/server/quadReactions.ts"), "utf8");
const actions = readFileSync(join(root, "lib/client/quadReactionActions.ts"), "utf8");
const feed = readFileSync(join(root, "lib/feedStore.ts"), "utf8");

describe("Ember tap reliability", () => {
  it("re-renders when Ember membership changes even if the post was already liked", () => {
    expect(card).toContain("userHasNodded");
    expect(card).toContain("userHasEmbered");
    expect(card).toContain("userHasNodded(pn, prev.currentUserId) !== userHasNodded(nn, next.currentUserId)");
    expect(card).toContain("userHasEmbered(pn, prev.currentUserId) !== userHasEmbered(nn, next.currentUserId)");
  });

  it("keeps Ember pending separate from like pending", () => {
    expect(card).toContain("emberPending");
    expect(card).toContain("pending={emberPending}");
    expect(quad).toContain("pendingEmbers");
    expect(quad).toContain("emberPending={pendingEmbers.has(item.note.id)}");
    expect(quad).not.toMatch(/likePending=\{pendingReactions\.has/);
  });

  it("handles iOS taps on pointerup and blocks double-spend / already-given casts", () => {
    expect(emberBtn).toContain("onPointerUp");
    expect(emberBtn).toContain("touchHandledRef");
    expect(emberBtn).toContain("already_given");
    expect(emberBtn).toContain("exhausted");
    expect(emberBtn).toContain("stopPropagation");
    expect(emberBtn).toContain('data-cq-media-control="true"');
    expect(emberBtn).toContain("min-h-[44px]");
    expect(emberBtn).toContain("aria-label={label}");
    expect(emberBtn).toContain("disabled={pending}");
    expect(css).toContain(".cq-ember-reaction-wrap");
    expect(css).toMatch(/\.cq-feed-post-actions\s*\{[\s\S]*z-index:\s*3/);
  });

  it("does not block Ember taps while a like is pending", () => {
    expect(card).toMatch(/function fireEmber\(\) \{\s*if \(emberPending\) return;/);
    expect(card).not.toMatch(/if \(emberPending \|\| likePending\) return;/);
  });

  it("keeps Ember controls above video/image media and triggers haptic cast feedback", () => {
    expect(emberBtn).toContain('data-cq-media-control="true"');
    expect(card).toContain("nativeImpact");
    expect(card).toContain('"light"');
    expect(card).toContain("EmberCastOverlay");
    expect(card).toContain("prefers-reduced-motion");
  });

  it("surfaces replenish copy when Embers are exhausted", () => {
    expect(embers).toContain('exhausted: "Your Embers will replenish tomorrow."');
    expect(embers).toContain('emberSent: "Ember given"');
    expect(embers).toContain('alreadyGiven: "You already gave this post an Ember"');
    expect(card).toContain("handleEmberBlocked");
    expect(card).toContain("EMBER_COPY.exhausted");
  });

  it("keeps Embers give-only so filled state cannot be toggled off", () => {
    expect(reactions).toContain("Already awarded — keep the row");
    expect(actions).toContain("optimisticGiveSparkOnAllCopies");
    expect(feed).toContain("export function optimisticGiveSpark");
    expect(quad).toContain("pendingEmbersRef.current = pending");
    expect(emberBtn).toContain('fill={active ? "currentColor" : "none"}');
    expect(css).toContain(".cq-ember-flame--active");
    expect(css).toContain("fill: currentColor !important");
  });
});
