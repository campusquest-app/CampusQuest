import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("app/globals.css", "utf8");
const carousel = readFileSync("components/events/HappeningSoonCarousel.tsx", "utf8");

function rule(selector: string): string {
  const start = css.indexOf(selector);
  expect(start).toBeGreaterThan(-1);
  return css.slice(start, css.indexOf("}", start));
}

/** Visible next-card sliver for a full-bleed scroller with 16px leading inset. */
function mobilePeek(viewport: number): number {
  const card = Math.min(viewport * 0.82, 360);
  return viewport - 16 - card - 14;
}

describe("Happening Soon mobile carousel", () => {
  it("sizes mobile cards so the next card peeks", () => {
    const slide = rule(".cq-happening-soon-slide {");
    expect(slide).toContain("flex: 0 0 auto");
    expect(slide).toContain("width: 82vw");
    expect(slide).toContain("max-width: 22.5rem");
    expect(slide).toContain("scroll-snap-align: start");
    expect(slide).not.toContain("width: 100%");
    expect(slide).not.toContain("flex: 1");
    expect(css).not.toContain("flex: 0 0 calc(100% - 2.25rem)");

    for (const viewport of [390, 393, 430]) {
      const peek = mobilePeek(viewport);
      expect(peek).toBeGreaterThanOrEqual(35);
      expect(peek).toBeLessThanOrEqual(55);
      expect(Math.min(viewport * 0.82, 360)).toBeLessThan(viewport);
    }
  });

  it("caps the hero and keeps the title on the image", () => {
    const media = rule(".cq-happening-card-media {");
    expect(media).toContain("height: clamp(10.25rem, 23vh, 12.2rem)");
    expect(media).not.toContain("min-height: 14.5rem");
    const image = rule(".cq-happening-card-image,");
    expect(image).toContain("object-fit: cover");
    const title = rule(".cq-happening-card-title {");
    expect(title).toContain("-webkit-line-clamp: 2");
    expect(title).toContain("position: absolute");
    expect(carousel).toContain('<h3 className="cq-happening-card-title">');
  });

  it("keeps a full-width mobile CTA with side and bottom inset", () => {
    const actions = rule(".cq-happening-card-actions {");
    expect(actions).toContain("padding: 0.55rem 0.75rem 0.7rem");
    expect(rule(".cq-happening-card-action {")).toContain("min-height: 3.125rem");
    expect(rule(".cq-happening-card-actions:has(> :only-child) {")).toContain("grid-template-columns: 1fr");
  });

  it("scrolls sideways without taking over the page", () => {
    const scroller = rule(".cq-happening-soon-scroller {");
    expect(scroller).toContain("overflow-x: auto");
    expect(scroller).toContain("scroll-snap-type: x mandatory");
    expect(scroller).toContain("-webkit-overflow-scrolling: touch");
    expect(scroller).toContain("touch-action: pan-x pan-y");
    expect(scroller).toContain("padding: 0 1rem");
    expect(scroller).toContain("gap: 0.875rem");
  });

  it("uses wider cards on tablet and desktop", () => {
    expect(css).toContain("width: 48vw");
    expect(css).toContain("width: 23.75rem");
  });

  it("hides dots for a single card and clears the bottom nav", () => {
    expect(carousel).toContain("rows.length > 1");
    expect(rule(".cq-happening-soon-dots {")).toContain("padding: 0.75rem 0 0.85rem");
    const shell = rule(".cq-tab-shell--events {");
    expect(shell).toContain("var(--cq-bottom-nav-h, 5.2rem)");
    expect(shell).toContain("env(safe-area-inset-bottom, 0px)");
  });
});
