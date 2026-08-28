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

describe("RealmMapMarker magical pin", () => {
  it("renders pointed pin structure with aura, particles, ground ring, and label", () => {
    const html = render({
      variant: "default",
      label: "Library",
      color: "electric-blue",
      activityState: "idle",
    });
    expect(html).toContain("realm-marker");
    expect(html).toContain('data-color="electric-blue"');
    expect(html).toContain("marker-pin");
    expect(html).toContain("marker-icon");
    expect(html).toContain("marker-aura");
    expect(html).toContain("marker-particles");
    expect(html).toContain("marker-ground-ring");
    expect(html).toContain("marker-label");
    expect(html).toContain("Library");
    expect(html).not.toContain("cq-realm-marker-connector");
  });

  it("shows count badge when multiple opportunities exist", () => {
    const html = render({
      variant: "event",
      label: "Union",
      color: "purple",
      opportunityCount: 5,
      activityState: "hot",
      activityCount: 2,
    });
    expect(html).toContain("marker-count");
    expect(html).toContain("5");
  });

  it("renders countdown badge, rings for an urgent event", () => {
    const html = render({
      variant: "event",
      label: "Weldin Hall",
      color: "magenta",
      countdown: hurryCountdown(),
    });
    expect(html).toContain("cq-event-countdown--hurry");
    expect(html).toContain("cq-event-countdown--u3");
    expect(html).toContain("HURRY! 8m");
    expect(html).toContain("cq-event-magic-ring");
    expect(html).toContain("cq-realm-marker--urgency-3");
    expect(html).toContain("realm-marker--starting-soon");
    expect(html).toContain("marker-aura");
  });

  it("shows event count for grouped markers", () => {
    const html = render({
      variant: "event",
      label: "Memorial Union",
      color: "violet",
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
      color: "coral",
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

  it("renders no countdown magic when there is no countdown", () => {
    const html = render({ variant: "quest", label: "Library", color: "gold" });
    expect(html).not.toContain("cq-event-countdown");
    expect(html).not.toContain("cq-event-magic-ring");
  });

  it("hides everything for ended events", () => {
    const html = render({
      variant: "event",
      label: "Weldin Hall",
      color: "orange",
      countdown: {
        state: { kind: "ended", label: "Ended", urgency: 0 },
        featuredEventId: null,
        eventCount: 1,
        allCancelled: false,
      } satisfies GroupCountdown,
    });
    expect(html).not.toContain("cq-event-countdown");
    expect(html).not.toContain("cq-event-magic");
  });

  it("deemphasizes optional markers without removing the pin", () => {
    const html = render({
      variant: "default",
      label: "Library",
      color: "electric-blue",
      deemphasized: true,
    });
    expect(html).toContain("cq-realm-marker--deemphasized");
    expect(html).toContain("marker-pin");
    expect(html).not.toContain("marker-particles");
  });

  it("intensifies selected state without dropping the pin shape", () => {
    const html = render({
      variant: "default",
      label: "The Quad",
      color: "gold",
      activityState: "selected",
      opportunityCount: 2,
    });
    expect(html).toContain("cq-realm-marker--state-selected");
    expect(html).toContain("marker-selected-pop");
    expect(html).toContain("marker-pin");
    expect(html).toContain("marker-count");
  });

  it("hides the name pill when hideLabel is set unless the marker is selected", () => {
    const hidden = render({
      variant: "default",
      label: "Business",
      hideLabel: true,
      zoomTier: "far",
    });
    expect(hidden).toContain("marker-pin");
    expect(hidden).not.toContain("marker-label");

    const selected = render({
      variant: "default",
      label: "Business",
      hideLabel: true,
      activityState: "selected",
    });
    expect(selected).toContain("marker-label");
    expect(selected).toContain("Business");
  });
});
