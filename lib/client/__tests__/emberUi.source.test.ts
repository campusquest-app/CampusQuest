import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const card = readFileSync(join(process.cwd(), "components/FieldNoteCard.tsx"), "utf8");
const emberBtn = readFileSync(join(process.cwd(), "components/embers/EmberReactionButton.tsx"), "utf8");
const explainer = readFileSync(join(process.cwd(), "components/embers/EmberExplainerSheet.tsx"), "utf8");
const overlay = readFileSync(join(process.cwd(), "components/embers/EmberCastOverlay.tsx"), "utf8");
const flame = readFileSync(join(process.cwd(), "components/embers/EmberFlameMark.tsx"), "utf8");
const actions = readFileSync(join(process.cwd(), "lib/client/quadReactionActions.ts"), "utf8");
const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
const quad = readFileSync(join(process.cwd(), "components/TheQuad.tsx"), "utf8");
const reactions = readFileSync(join(process.cwd(), "lib/server/quadReactions.ts"), "utf8");

describe("Ember UI and copy", () => {
  it("uses the Lucide flame, not a lightning bolt or emoji", () => {
    expect(emberBtn).toContain("Flame");
    expect(emberBtn).not.toContain("Zap");
    expect(emberBtn).not.toContain("⚡");
    expect(emberBtn).toContain("EMBER_COLOR_ACTIVE");
    expect(emberBtn).toContain("EMBER_COLOR_IDLE");
    expect(emberBtn).toContain("size={22}");
    expect(emberBtn).toContain("strokeWidth={2}");
    expect(emberBtn).toContain("min-h-[44px]");
    expect(emberBtn).toContain("min-w-[44px]");
    expect(card).toContain("EmberReactionButton");
    expect(card).not.toMatch(/Unspark|Give Spark|Spark this post/);
  });

  it("shows a one-time explainer and allowance hint", () => {
    expect(explainer).toContain("EMBER_COPY.explainerTitle");
    expect(explainer).toContain("EMBER_COPY.explainerBody");
    expect(explainer).toContain("EMBER_COPY.explainerAck");
    expect(emberBtn).toContain("remainingEmbersCopy");
    expect(css).toContain(".cq-ember-pulse");
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(quad).toContain("Like, Ember, and verify");
  });

  it("plays a pointer-safe consumption spell from the remaining allowance", () => {
    expect(overlay).toContain("getAnchorRect");
    expect(overlay).toContain("plan.startingCount");
    expect(overlay).toContain("reducedMotion");
    expect(overlay).toContain("EMBER_COPY.emberSent");
    expect(overlay).toContain("plan.unlimited");
    expect(overlay).toContain("cq-ember-cast--unlimited");
    expect(css).toContain("cq-ember-cast-trail");
    expect(css).toContain(".cq-ember-owner-total");
    expect(overlay).not.toContain("🎉");
    expect(overlay).not.toContain("🔥");
    expect(flame).toContain("EMBER_COLOR_ACTIVE");
    expect(flame).toContain("EMBER_COLOR_HIGHLIGHT");
    expect(flame).toContain("EMBER_COLOR_DEEP");
    expect(flame).not.toContain("emoji");
    expect(css).toContain(".cq-ember-cast");
    expect(css).toContain("pointer-events: none");
    expect(css).toContain("cq-ember-cast-consume");
    expect(card).toContain("EmberCastOverlay");
    expect(card).toContain("subscribeEmberCast");
    expect(actions).toContain("publishEmberCast");
    expect(actions).toContain("result.active && !wasSparked");
  });

  it("reuses spark reaction storage instead of a second reaction system", () => {
    expect(reactions).toContain('EMBER_REACTION_TYPE');
    expect(reactions).toContain("quad_post_reactions");
    expect(reactions).not.toMatch(/from\(["']embers["']\)/);
    expect(reactions).not.toMatch(/await maybeAwardSparkXp/);
  });
});
