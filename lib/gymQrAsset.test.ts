import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import jsQR from "jsqr";
import sharp from "sharp";
import { classifyQrScanText } from "@/lib/client/qrScanClassify";
import { extractCampusQuestQrCode } from "@/lib/qrCodeExtract";
import {
  OFFICIAL_GYM_QR_ASSET_PATH,
  OFFICIAL_GYM_QR_PAYLOAD,
  isGymQrDatabaseCode,
} from "@/lib/gymQr";

describe("official GYM QR asset", () => {
  it("documents payload GYM for scanner and database code GYM", () => {
    expect(OFFICIAL_GYM_QR_PAYLOAD).toBe("GYM");
    expect(extractCampusQuestQrCode("GYM")).toBe("GYM");
    expect(classifyQrScanText("GYM")).toMatchObject({ kind: "secure", code: "GYM" });
  });

  it("ships gym_qr.png and decodes to GYM", async () => {
    const file = resolve(process.cwd(), "public", OFFICIAL_GYM_QR_ASSET_PATH.replace(/^\//, ""));
    expect(existsSync(file)).toBe(true);
    const buf = readFileSync(file);
    expect(buf.subarray(0, 8).toString("hex")).toMatch(/^89504e47/);

    const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(info.width).toBeGreaterThanOrEqual(512);
    expect(info.height).toBeGreaterThanOrEqual(512);
    const rgba = new Uint8ClampedArray(info.width * info.height * 4);
    for (let i = 0, j = 0; i < data.length; i += info.channels, j += 4) {
      const g = data[i];
      rgba[j] = g;
      rgba[j + 1] = g;
      rgba[j + 2] = g;
      rgba[j + 3] = 255;
    }
    const decoded = jsQR(rgba, info.width, info.height);
    expect(decoded?.data).toBe("GYM");
  });

  it("maps gym database codes for admin static image", () => {
    expect(isGymQrDatabaseCode("GYM")).toBe(true);
    expect(isGymQrDatabaseCode("URI_GYM_CHECKIN_V1")).toBe(true);
    expect(isGymQrDatabaseCode("LIBRARY")).toBe(false);
  });
});
