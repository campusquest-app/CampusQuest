import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { dismissAppToast, getAppToast, showAppToast } from "@/lib/client/appToast";

const root = process.cwd();
const host = readFileSync(join(root, "components/AppToastHost.tsx"), "utf8");
const dashboard = readFileSync(join(root, "components/Dashboard.tsx"), "utf8");
const quad = readFileSync(join(root, "components/TheQuad.tsx"), "utf8");
const card = readFileSync(join(root, "components/FieldNoteCard.tsx"), "utf8");
const css = readFileSync(join(root, "app/globals.css"), "utf8");
const reactions = readFileSync(join(root, "lib/server/quadReactions.ts"), "utf8");
const migration = readFileSync(
  join(root, "supabase/migrations/20261019010000_ember_hype_count_trigger_fix.sql"),
  "utf8",
);

describe("viewport AppToast", () => {
  afterEach(() => {
    dismissAppToast();
  });

  it("hosts toasts in a fixed safe-area layer above the bottom nav", () => {
    expect(dashboard).toContain("AppToastHost");
    expect(host).toContain("cq-app-toast-host");
    expect(css).toContain(".cq-app-toast-host");
    expect(css).toContain("position: fixed");
    expect(css).toContain("var(--cq-bottom-nav-h");
    expect(css).toContain("env(safe-area-inset-bottom");
    expect(css).toContain("z-index: 12060");
  });

  it("routes Quad Ember failures through the viewport toast, not the Memories banner", () => {
    expect(quad).toContain('showAppToast(result.message, { tone: "error" })');
    expect(quad).not.toContain("reactionNotice");
    expect(quad).not.toContain("cq-quad-reaction-notice");
    expect(card).toContain("showAppToast");
    expect(card).not.toContain("actionToast");
    const actions = readFileSync(join(root, "lib/client/quadReactionActions.ts"), "utf8");
    const overlay = readFileSync(join(root, "components/embers/EmberCastOverlay.tsx"), "utf8");
    expect(actions).toContain("showAppToast(EMBER_COPY.emberSent");
    expect(card).not.toContain("EMBER_COPY.emberSent");
    expect(overlay).not.toContain("EMBER_COPY.emberSent");
  });

  it("stores the latest toast for the host", () => {
    showAppToast("Couldn't send Ember. Try again.", { tone: "error" });
    expect(getAppToast()?.message).toBe("Couldn't send Ember. Try again.");
    expect(getAppToast()?.tone).toBe("error");
  });
});

describe("Ember insert reliability", () => {
  it("avoids INSERT RETURNING and treats unique races as success", () => {
    expect(reactions).toContain("Avoid INSERT…RETURNING");
    expect(reactions).toContain('if (insertError.code === "23505")');
    expect(reactions).toContain("return;");
    expect(reactions).toContain('from("quad_post_reactions").insert({');
    expect(reactions).toContain("never fail the client for notification issues");
  });

  it("fixes the hype_count trigger so Ember inserts do not read the revoked column", () => {
    expect(migration).toContain("security definer");
    expect(migration).toContain("count(*)::integer into spark_total");
    expect(migration).toContain("set hype_count = coalesce(spark_total, 0)");
    expect(migration).not.toMatch(/set hype_count = hype_count \+ 1/i);
  });
});
