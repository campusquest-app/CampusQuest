import { describe, expect, it } from "vitest";
import {
  dockCradlePath,
  dockCradleRadius,
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
    const path = dockCradlePath({ width: 390, height: 96 });
    expect(path.startsWith(`M0,${DOCK_CRADLE_RISE_PX.toFixed(2)}`)).toBe(true);
    expect(path.endsWith(" Z")).toBe(true);
    expect(path).toContain("H390.00");
    expect(path).toContain("V96.00");
    expect(path).toContain("H0 Z");
  });

  it("keeps a circular cradle radius at iPhone widths", () => {
    const expected = dockCradleRadius().toFixed(2);
    for (const width of [375, 390, 430]) {
      const radii = arcRadii(dockCradlePath({ width, height: 96 }));
      expect(radii).toEqual([`${expected},${expected}`]);
    }
  });

  it("centers the cradle and stays symmetrical", () => {
    const path = dockCradlePath({ width: 390, height: 80, centerX: 195 });
    const left = Number(path.match(/H([\d.]+)\sA/)?.[1]);
    const right = Number(path.match(/A[\d.,\s]+ ([\d.]+),22\.00 H390/)?.[1]);
    expect(left).toBeGreaterThan(0);
    expect(right).toBeGreaterThan(left);
    expect(Math.abs(195 - left - (right - 195))).toBeLessThan(0.05);
  });
});
