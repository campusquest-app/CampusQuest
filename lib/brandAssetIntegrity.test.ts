/**
 * Brand asset integrity — catch JPEG-mislabeled-as-PNG / opaque replacements.
 * Signature/IHDR checks use Node only; alpha-pixel sampling uses sharp (already a dep).
 * Never re-encodes or writes brand artwork.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { BRAND_KNIGHT, BRAND_LOGO_OFFICIAL } from "@/lib/onboarding/taxonomy";
import { CAMPUSQUEST_LOGO_SRC } from "@/lib/branding";

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_SIG = Buffer.from([0xff, 0xd8]);

const ROOT = join(process.cwd(), "public");

function publicPath(webPath: string) {
  return join(ROOT, webPath.replace(/^\//, ""));
}

function inspectPngHeader(buf: Buffer) {
  if (buf.subarray(0, 2).equals(JPEG_SIG)) {
    return { ok: false as const, reason: "file is JPEG content, not PNG" };
  }
  if (!buf.subarray(0, 8).equals(PNG_SIG)) {
    return { ok: false as const, reason: "missing PNG signature" };
  }
  const length = buf.readUInt32BE(8);
  const type = buf.subarray(12, 16).toString("ascii");
  if (type !== "IHDR" || length < 13) {
    return { ok: false as const, reason: `expected IHDR, got ${type}` };
  }
  const colorType = buf[25];
  const hasAlphaChannel = colorType === 4 || colorType === 6;
  if (!hasAlphaChannel) {
    return {
      ok: false as const,
      reason: `PNG color type ${colorType} has no alpha channel (need 4 or 6)`,
      colorType,
    };
  }
  return { ok: true as const, colorType };
}

async function transparentPixelPercent(absPath: string): Promise<number> {
  const { data, info } = await sharp(absPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const channels = info.channels;
  let transparent = 0;
  const pixels = info.width * info.height;
  for (let i = channels - 1; i < data.length; i += channels) {
    if (data[i]! < 255) transparent += 1;
  }
  return (100 * transparent) / pixels;
}

describe("brand asset integrity", () => {
  it("keeps the transparent CampusQuest logo as the onboarding brand logo", () => {
    expect(BRAND_LOGO_OFFICIAL).toBe(CAMPUSQUEST_LOGO_SRC);
    expect(BRAND_LOGO_OFFICIAL).toBe("/campusquest-logo.png");
  });

  it("requires the CampusQuest logo to be a real RGBA PNG with transparency", async () => {
    const path = publicPath(CAMPUSQUEST_LOGO_SRC);
    expect(existsSync(path)).toBe(true);
    const header = inspectPngHeader(readFileSync(path));
    expect(header.ok, header.ok ? undefined : header.reason).toBe(true);
    const pct = await transparentPixelPercent(path);
    expect(pct).toBeGreaterThan(10);
  });

  it("requires every onboarding knight asset to be a real RGBA PNG with transparency", async () => {
    const paths = Object.values(BRAND_KNIGHT);
    expect(paths.length).toBeGreaterThanOrEqual(7);
    for (const webPath of paths) {
      const path = publicPath(webPath);
      expect(existsSync(path), `missing ${webPath}`).toBe(true);
      const header = inspectPngHeader(readFileSync(path));
      expect(header.ok, `${webPath}: ${header.ok ? "" : header.reason}`).toBe(true);
      const pct = await transparentPixelPercent(path);
      expect(pct, `${webPath} should have transparent pixels`).toBeGreaterThan(10);
    }
  });

  it("welcome thumbs-up knight path is the approved original pose file", () => {
    expect(BRAND_KNIGHT.thumbsUp).toBe("/brand/knight/thumbs-up.png");
  });
});
