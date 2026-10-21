import { describe, expect, it, vi } from "vitest";
import { createEventDetailDismissHandle } from "@/lib/client/eventDetailDismiss";

function mockSurface() {
  const attrs = new Map<string, string>();
  return {
    style: { visibility: "", pointerEvents: "" } as CSSStyleDeclaration,
    setAttribute(name: string, value: string) {
      attrs.set(name, value);
    },
    getAttribute(name: string) {
      return attrs.get(name) ?? null;
    },
  } as unknown as HTMLElement;
}

describe("createEventDetailDismissHandle", () => {
  it("hides the surface and restores body overflow synchronously before onBack returns", () => {
    const surface = mockSurface();
    const body = { style: { overflow: "hidden" } };
    const previousOverflow = "";

    // Patch document.body for this assertion only.
    const originalDocument = globalThis.document;
    (globalThis as { document?: Document }).document = {
      body,
    } as unknown as Document;

    let onBackReached = false;
    let visibilityWhenOnBack = "";
    let pointerWhenOnBack = "";
    let bodyOverflowWhenOnBack = "";

    try {
      const handle = createEventDetailDismissHandle({
        getSurface: () => surface,
        getPreviousBodyOverflow: () => previousOverflow,
        onBack: () => {
          onBackReached = true;
          visibilityWhenOnBack = surface.style.visibility;
          pointerWhenOnBack = surface.style.pointerEvents;
          bodyOverflowWhenOnBack = body.style.overflow;
        },
      });

      const started = performance.now();
      handle.dismiss();
      const elapsedMs = performance.now() - started;

      expect(onBackReached).toBe(true);
      expect(visibilityWhenOnBack).toBe("hidden");
      expect(pointerWhenOnBack).toBe("none");
      expect(bodyOverflowWhenOnBack).toBe("");
      expect(surface.getAttribute("data-cq-event-detail-dismissed")).toBe("true");
      expect(surface.getAttribute("aria-hidden")).toBe("true");
      expect(handle.wasDismissed()).toBe(true);
      // Sync path: hide + onBack in the same turn. Target is well under 100ms on CI.
      expect(elapsedMs).toBeLessThan(100);
    } finally {
      if (originalDocument === undefined) {
        delete (globalThis as { document?: Document }).document;
      } else {
        (globalThis as { document?: Document }).document = originalDocument;
      }
    }
  });

  it("ignores duplicate dismiss calls so back cannot double-navigate", () => {
    const onBack = vi.fn();
    const handle = createEventDetailDismissHandle({
      getSurface: () => null,
      getPreviousBodyOverflow: () => "",
      onBack,
    });

    handle.dismiss();
    handle.dismiss();
    handle.dismiss();

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("still calls onBack when the surface node is already gone", () => {
    const onBack = vi.fn();
    const body = { style: { overflow: "hidden" } };
    const originalDocument = globalThis.document;
    (globalThis as { document?: Document }).document = { body } as unknown as Document;

    try {
      const handle = createEventDetailDismissHandle({
        getSurface: () => null,
        getPreviousBodyOverflow: () => "auto",
        onBack,
      });

      handle.dismiss();

      expect(onBack).toHaveBeenCalledTimes(1);
      expect(body.style.overflow).toBe("auto");
    } finally {
      if (originalDocument === undefined) {
        delete (globalThis as { document?: Document }).document;
      } else {
        (globalThis as { document?: Document }).document = originalDocument;
      }
    }
  });
});

describe("event detail back-nav source contracts", () => {
  it("wires sync dismiss into EventDetailScreen and preserves caller back labels", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const detail = readFileSync(join(process.cwd(), "components/events/EventDetailScreen.tsx"), "utf8");
    const feed = readFileSync(join(process.cwd(), "components/EventsFeed.tsx"), "utf8");
    const map = readFileSync(join(process.cwd(), "components/realm/RealmMap.tsx"), "utf8");

    expect(detail).toContain("createEventDetailDismissHandle");
    expect(detail).toContain("handleBack");
    expect(detail).not.toMatch(/onClick=\{onBack\}/);
    expect(feed).toContain("closeDetail");
    expect(feed).toContain('backLabel="Events"');
    expect(map).toContain('backLabel="Map"');
    expect(map).toContain("closeEventDetail");
  });
});
