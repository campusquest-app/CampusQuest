import { describe, expect, it } from "vitest";
import {
  dockCradleMetrics,
  dockCradlePath,
  dockCradleRadius,
  DOCK_CRADLE_BUTTON_PX,
  DOCK_CRADLE_GAP_PX,
  DOCK_CRADLE_RISE_PX,
} from "@/lib/client/dockCradlePath";

function arcRadii(path: string): string[] {
  const out: string[] = [];
  const re = /A([\d.]+),([\d.]+)/g;
  let match: RegExpExecArray | null = re.exec(path);
  while (match) {
    out.push(`${match[1]},${match[2]}`);
    match = re.exec(path);
  }
  return out;
}

describe("dockCradlePath", () => {
  it("draws one closed silhouette that spans the full bar", () => {
    const path = dockCradlePath({ width: 390, height: 106 });
    expect(path.startsWith(`M0,${DOCK_CRADLE_RISE_PX.toFixed(2)}`)).toBe(true);
    expect(path.endsWith(" Z")).toBe(true);
    expect(path).toContain("H390.00");
    expect(path).toContain("V106.00");
    expect(path).toContain("H0 Z");
  });

  it("raises a circular dome above the bar at iPhone widths", () => {
    const metrics = dockCradleMetrics();
    const expected = dockCradleRadius().toFixed(2);
    expect(metrics.radius).toBeCloseTo(DOCK_CRADLE_BUTTON_PX / 2 + DOCK_CRADLE_GAP_PX, 5);
    expect(metrics.centerDrop).toBeGreaterThan(0);
    expect(metrics.rise).toBe(DOCK_CRADLE_RISE_PX);
    for (const width of [375, 390, 430]) {
      const path = dockCradlePath({ width, height: 106 });
      expect(arcRadii(path)).toEqual([`${expected},${expected}`]);
      expect(path).toContain(" 0 0 1 ");
      expect(path).not.toContain(" 0 0 0 ");
    }
  });

  it("centers the cradle and stays symmetrical", () => {
    const path = dockCradlePath({ width: 390, height: 106, centerX: 195 });
    const rise = DOCK_CRADLE_RISE_PX.toFixed(2);
    const left = Number(path.match(/H([\d.]+)\sA/)?.[1]);
    const right = Number(path.match(new RegExp(`A[\\d.,\\s]+ ([\\d.]+),${rise} H390`))?.[1]);
    expect(left).toBeGreaterThan(0);
    expect(right).toBeGreaterThan(left);
    expect(Math.abs(195 - left - (right - 195))).toBeLessThan(0.05);
  });
});
