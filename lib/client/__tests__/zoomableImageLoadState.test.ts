import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..", "..", "..");
const zoomable = readFileSync(join(root, "components/quad/ZoomableImage.tsx"), "utf8");

describe("ZoomableImage load-error reliability", () => {
  it("only shows the error overlay when no usable paint exists for the current src", () => {
    expect(zoomable).toContain("hasUsablePaint");
    expect(zoomable).toContain("showError = loadSrc && phase === \"error\" && !hasUsablePaint");
    expect(zoomable).toContain("paintedForLogicalSrcRef");
    expect(zoomable).toContain("imageElementIsUsable");
  });

  it("preserves the last successful paint across retries and variant fallback", () => {
    expect(zoomable).toContain("setUseFallback(true)");
    expect(zoomable).toContain("sources.fallbackSrc");
    expect(zoomable).toContain("setPaintedSrc(painted)");
    expect(zoomable).toContain("Retry");
  });

  it("does not treat timeout as fatal when a frame already painted", () => {
    expect(zoomable).toContain("IMAGE_LOAD_TIMEOUT_MS");
    expect(zoomable).toMatch(/paintedSrcRef\.current && paintedForLogicalSrcRef\.current === src/);
    expect(zoomable).toContain('setPhase("ready")');
  });
});
