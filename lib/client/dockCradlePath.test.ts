import { describe, expect, it } from "vitest";
import {
  dockCradleMetrics,
  dockCradlePath,
  dockCradleTopPath,
  dockCradleHalfChord,
  DOCK_CRADLE_DIP_PX,
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
  it("draws one closed silhouette that spans the full bar with a flat top start", () => {
    const path = dockCradlePath({ width: 390, height: 76 });
    expect(path.startsWith("M0,0")).toBe(true);
    expect(path.endsWith(" Z")).toBe(true);
    expect(path).toContain("H390.00");
    expect(path).toContain("V76.00");
    expect(path).toContain("H0 Z");
    // No upward dome padding in the layout box.
    expect(DOCK_CRADLE_RISE_PX).toBe(0);
  });

  it("dips a shallow circular cradle below the flat top at iPhone widths", () => {
    const metrics = dockCradleMetrics();
    expect(metrics.dip).toBe(DOCK_CRADLE_DIP_PX);
    expect(metrics.halfChord).toBeCloseTo(dockCradleHalfChord(), 5);
    expect(metrics.centerDrop).toBeLessThan(0);
    expect(metrics.dip).toBeLessThan(metrics.radius);
    // Shallow well — not a deep semicircle cutout.
    expect(metrics.dip).toBeLessThanOrEqual(metrics.halfChord);
    const expected = metrics.radius.toFixed(2);
    for (const width of [320, 375, 390, 430]) {
      const path = dockCradlePath({ width, height: 76 });
      expect(arcRadii(path)).toEqual([`${expected},${expected}`]);
      // Counterclockwise minor arc from left→right bows downward into the bar.
      expect(path).toMatch(/A[\d.]+,[\d.]+ 0 0 0 /);
      expect(path).not.toMatch(/A[\d.]+,[\d.]+ 0 0 1 /);
      expect(path).not.toMatch(/A[\d.]+,[\d.]+ 0 1 /);
    }
  });

  it("centers the cradle and stays symmetrical", () => {
    const path = dockCradlePath({ width: 390, height: 76, centerX: 195 });
    const left = Number(path.match(/H([\d.]+)\sA/)?.[1]);
    const right = Number(path.match(/A[\d.,\s]+ ([\d.]+),0 H390/)?.[1]);
    expect(left).toBeGreaterThan(0);
    expect(right).toBeGreaterThan(left);
    expect(Math.abs(195 - left - (right - 195))).toBeLessThan(0.05);
  });

  it("exposes a matching open top path for the cyan stroke", () => {
    const top = dockCradleTopPath({ width: 390 });
    expect(top.startsWith("M0,0")).toBe(true);
    expect(top.endsWith("H390.00")).toBe(true);
    expect(top).not.toContain("Z");
    expect(dockCradlePath({ width: 390, height: 76 }).startsWith(top)).toBe(true);
  });
});
