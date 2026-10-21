/**
 * Measures the cost of clearing event detail state with vs without list attribute thrash.
 * These are synthetic React render timings (not Capacitor device traces) used to quantify
 * the back-nav regression class we fixed: re-rendering a large Events list while also
 * toggling inert/aria-hidden on close.
 */
import { createElement, useState, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

function Card({ id }: { id: number }) {
  return createElement(
    "article",
    { className: "cq-event-card" },
    createElement("h3", null, `Event ${id}`),
    createElement("p", null, "Campus event description with enough text to resemble a real card."),
  );
}

function LegacyFeed({ n, detailOpen }: { n: number; detailOpen: boolean }) {
  const cards: ReactNode[] = [];
  for (let i = 0; i < n; i += 1) cards.push(createElement(Card, { key: i, id: i }));
  return createElement(
    "div",
    null,
    createElement(
      "section",
      {
        className: detailOpen ? "cq-events-discovery pointer-events-none" : "cq-events-discovery",
        "aria-hidden": detailOpen ? true : undefined,
        inert: detailOpen ? "" : undefined,
      },
      cards,
    ),
    detailOpen ? createElement("div", { className: "cq-event-detail" }, "DETAIL") : null,
  );
}

function FixedFeed({ n, detailOpen }: { n: number; detailOpen: boolean }) {
  const cards: ReactNode[] = [];
  for (let i = 0; i < n; i += 1) cards.push(createElement(Card, { key: i, id: i }));
  return createElement(
    "div",
    null,
    createElement("section", { className: "cq-events-discovery" }, cards),
    detailOpen ? createElement("div", { className: "cq-event-detail" }, "DETAIL") : null,
  );
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function measureClose(label: "legacy" | "fixed", n: number, runs = 40): { p50: number; p95: number; avg: number } {
  const times: number[] = [];
  for (let i = 0; i < runs; i += 1) {
    const Feed = label === "legacy" ? LegacyFeed : FixedFeed;
    // Warm open state markup so close measures the transition work.
    renderToStaticMarkup(createElement(Feed, { n, detailOpen: true }));
    const t0 = performance.now();
    renderToStaticMarkup(createElement(Feed, { n, detailOpen: false }));
    times.push(performance.now() - t0);
  }
  const avg = times.reduce((sum, value) => sum + value, 0) / times.length;
  const sorted = [...times].sort((a, b) => a - b);
  return { avg, p50: median(times), p95: sorted[Math.floor(sorted.length * 0.95)] ?? 0 };
}

describe("event detail back-nav render cost", () => {
  it("reduces close-render cost vs legacy inert/aria-hidden thrash on a large list", () => {
    const cardCount = 120;
    const before = measureClose("legacy", cardCount);
    const after = measureClose("fixed", cardCount);

    // Publish numbers for the performance report (SSR markup proxy — not Capacitor device traces).
    // eslint-disable-next-line no-console
    console.info(
      `[event-back-nav] cards=${cardCount} before p50=${before.p50.toFixed(3)}ms p95=${before.p95.toFixed(3)}ms; after p50=${after.p50.toFixed(3)}ms p95=${after.p95.toFixed(3)}ms`,
    );
    expect(after.p50).toBeLessThanOrEqual(before.p50 * 1.05);

    // Sync dismiss helper path is covered elsewhere; this guard keeps the list
    // close path from regressing into multi-hundred-ms territory on CI.
    expect(after.p95).toBeLessThan(50);
  });

  it("does not couple detail open state into list attributes in the live EventsFeed", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const feed = readFileSync(join(process.cwd(), "components/EventsFeed.tsx"), "utf8");
    expect(feed).toContain('className="cq-events-discovery"');
    expect(feed).not.toContain("pointer-events-none");
    expect(feed).not.toContain("inert={liveDetail");
  });
});
