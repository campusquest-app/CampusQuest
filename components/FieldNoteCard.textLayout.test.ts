import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const card = fs.readFileSync(path.join(root, "components/FieldNoteCard.tsx"), "utf8");
const css = fs.readFileSync(path.join(root, "app/globals.css"), "utf8");

describe("text-only feed layout", () => {
  it("groups text posts into an avatar column and a content column", () => {
    const textBranch = card.slice(card.indexOf("cq-feed-text-layout"), card.indexOf(") : isFeed ?"));
    expect(textBranch).toContain("cq-feed-text-avatar");
    expect(textBranch).toContain("cq-feed-text-main");
    expect(textBranch).toContain("cq-feed-text-header");
    expect(textBranch).toContain("cq-feed-text-body");
    expect(textBranch.indexOf("cq-feed-text-header")).toBeLessThan(textBranch.indexOf("cq-feed-text-body"));
    expect(textBranch.indexOf("cq-feed-text-body")).toBeLessThan(textBranch.indexOf("cq-feed-post-actions"));
    expect(textBranch).toContain("Your anonymous post");
    expect(textBranch).not.toContain("proofBlock ? (");
  });

  it("keeps the media feed branch on the existing header", () => {
    const mediaStart = card.indexOf(") : isFeed ?");
    const mediaBranch = card.slice(mediaStart, mediaStart + 1800);
    expect(mediaBranch).toContain("cq-feed-post-header");
    expect(mediaBranch).not.toContain("cq-feed-text-layout");
  });

  it("sizes text posts from their content and separates them with a theme border", () => {
    expect(css).toContain(".cq-feed-text-layout");
    expect(css).toContain("min-width: 0");
    expect(css).toContain("gap: 10px");
    expect(css).toContain("width: 34px");
    expect(css).toContain("height: 34px");
    expect(css).toContain("border-bottom: 1px solid var(--cq-border)");
    expect(css).toContain("overflow-wrap: anywhere");
    expect(css).toContain("white-space: pre-wrap");
    expect(css).not.toContain("contain-intrinsic-size: auto 7.5rem");
  });
});
