import { describe, expect, it } from "vitest";
import {
  createMapClickSuppressor,
  MAP_MARKER_CLICK_SUPPRESS_MS,
  shouldFireMapMarkerTap,
} from "./mapMarkerTap";

describe("createMapClickSuppressor", () => {
  it("suppresses map background clicks for a short window after a marker tap", () => {
    const gate = createMapClickSuppressor(400);
    expect(gate.isSuppressed(1000)).toBe(false);
    gate.suppress(1000);
    expect(gate.isSuppressed(1100)).toBe(true);
    expect(gate.isSuppressed(1399)).toBe(true);
    expect(gate.isSuppressed(1400)).toBe(false);
  });

  it("extends an active suppress window instead of shortening it", () => {
    const gate = createMapClickSuppressor(400);
    gate.suppress(1000);
    gate.suppress(1200);
    expect(gate.isSuppressed(1500)).toBe(true);
    expect(gate.isSuppressed(1600)).toBe(false);
  });

  it("uses the shared marker suppress duration by default", () => {
    expect(MAP_MARKER_CLICK_SUPPRESS_MS).toBeGreaterThanOrEqual(400);
    const gate = createMapClickSuppressor();
    gate.suppress(0);
    expect(gate.isSuppressed(MAP_MARKER_CLICK_SUPPRESS_MS - 1)).toBe(true);
    expect(gate.isSuppressed(MAP_MARKER_CLICK_SUPPRESS_MS)).toBe(false);
  });
});

describe("shouldFireMapMarkerTap mobile jitter", () => {
  it("accepts finger jitter up to ~18px so iPhone taps still open", () => {
    expect(
      shouldFireMapMarkerTap(
        { x: 100, y: 200, t: 1000 },
        { x: 116, y: 205, now: 1180 },
      ),
    ).toBe(true);
  });

  it("still rejects clear pans", () => {
    expect(
      shouldFireMapMarkerTap(
        { x: 100, y: 200, t: 1000 },
        { x: 140, y: 200, now: 1180 },
      ),
    ).toBe(false);
  });
});

describe("marker tap vs trailing map-click race", () => {
  it("keeps selection open when Maps API fires a background click right after a marker tap", () => {
    const mapGate = createMapClickSuppressor(450);
    let ignoreBackgroundCloseUntil = 0;
    let sheetOpen = false;
    let selectedId: string | null = null;

    const armBackgroundCloseGuard = (now: number) => {
      ignoreBackgroundCloseUntil = now + 450;
    };
    const onMarkerTap = (id: string, now: number) => {
      mapGate.suppress(now);
      armBackgroundCloseGuard(now);
      selectedId = id;
      sheetOpen = true;
    };
    const onMapBackgroundClick = (now: number) => {
      if (mapGate.isSuppressed(now)) return;
      if (now < ignoreBackgroundCloseUntil) return;
      sheetOpen = false;
      selectedId = null;
    };

    // Mobile path: pointerup tap opens sheet, then Maps synthesizes a map click ~30ms later.
    onMarkerTap("library", 1000);
    onMapBackgroundClick(1030);
    expect(sheetOpen).toBe(true);
    expect(selectedId).toBe("library");

    // Intentional background dismiss after the suppress window.
    onMapBackgroundClick(1600);
    expect(sheetOpen).toBe(false);
    expect(selectedId).toBe(null);
  });

  it("opens grouped-marker detail the same way as a landmark tap", () => {
    const mapGate = createMapClickSuppressor();
    let sheetOpen = false;
    let contentKey: string | null = null;

    const openGrouped = (groupKey: string, now: number) => {
      mapGate.suppress(now);
      contentKey = groupKey;
      sheetOpen = true;
    };
    const onMapBackgroundClick = (now: number) => {
      if (mapGate.isSuppressed(now)) return;
      sheetOpen = false;
      contentKey = null;
    };

    openGrouped("events:union:2", 5000);
    onMapBackgroundClick(5100);
    expect(sheetOpen).toBe(true);
    expect(contentKey).toBe("events:union:2");
  });
});
