import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RealmMapMarker } from "@/components/realm/RealmMapMarker";
import type { GroupCountdown } from "@/lib/realm/eventCountdown";

function render(props: Record<string, unknown>): string {
  return renderToStaticMarkup(createElement(RealmMapMarker, props as never));
}

function hurryCountdown(overrides?: Partial<GroupCountdown>): GroupCountdown {
  return {
    state: { kind: "hurry", label: "HURRY! 8m", urgency: 3 },
    featuredEventId: "e1",
    eventCount: 1,
    allCancelled: false,
    ...overrides,
  };
}

describe("RealmMapMarker event magic layer", () => {
  it("renders countdown badge, rings, and sparks for an urgent event", () => {
    const html = render({ variant: "event", label: "Weldin Hall", countdown: hurryCountdown() });
    expect(html).toContain("cq-event-countdown--hurry");
    expect(html).toContain("cq-event-countdown--u3");
    expect(html).toContain("HURRY! 8m");
    expect(html).toContain("cq-event-magic-ring");
    expect(html).toContain("cq-event-magic-ring--second");
    expect(html).toContain("cq-event-magic-spark--three");
    expect(html).toContain("cq-realm-marker--urgency-3");
    expect(html).toContain("cq-marker-aura");
  });

  it("shows event count for grouped markers", () => {
    const html = render({
      variant: "event",
      label: "Memorial Union",
      countdown: hurryCountdown({
        eventCount: 3,
        state: { kind: "soon", label: "Next: 12m", urgency: 1 },
      }),
    });
    expect(html).toContain("3 Events");
    expect(html).toContain("Next: 12m");
  });

  it("renders cancelled styling without rings or shake urgency", () => {
    const html = render({
      variant: "event",
      label: "Weldin Hall",
      countdown: {
        state: { kind: "cancelled", label: "CANCELLED", urgency: 0 },
        featuredEventId: null,
        eventCount: 1,
        allCancelled: true,
      } satisfies GroupCountdown,
    });
    expect(html).toContain("CANCELLED");
    expect(html).toContain("cq-realm-marker--cancelled");
    expect(html).not.toContain("cq-event-magic-ring");
    expect(html).not.toContain("cq-realm-marker--urgency");
  });

  it("renders no badge or magic when there is no countdown", () => {
    const html = render({ variant: "quest", label: "Library" });
    expect(html).not.toContain("cq-event-countdown");
    expect(html).not.toContain("cq-event-magic-ring");
  });

  it("hides everything for ended events", () => {
    const html = render({
      variant: "event",
      label: "Weldin Hall",
      countdown: {
        state: { kind: "ended", label: "Ended", urgency: 0 },
        featuredEventId: null,
        eventCount: 1,
        allCancelled: false,
      } satisfies GroupCountdown,
    });
    expect(html).not.toContain("cq-event-countdown");
  });
});
