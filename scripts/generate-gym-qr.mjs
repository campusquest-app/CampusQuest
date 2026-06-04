/**
 * Generate public/assets/gym_qr.png encoding exactly "GYM".
 * Verifies decode before write. Run: npm run generate:gym-qr
 */
import { writeFileSync, copyFileSync } from "node:fs";
import { resolve } from "node:path";
import QRCode from "qrcode";
import sharp from "sharp";
import jsQR from "jsqr";

const PAYLOAD = "GYM";
const SIZE = 512;
const MARGIN = 4;
const OUT_PRIMARY = resolve(process.cwd(), "public/assets/gym_qr.png");
const OUT_LEGACY = resolve(process.cwd(), "public/assets/qr-gym-uri.png");

async function decodePngBuffer(png) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const rgba = new Uint8ClampedArray(info.width * info.height * 4);
  for (let i = 0, j = 0; i < data.length; i += info.channels, j += 4) {
    const g = data[i];
    rgba[j] = g;
    rgba[j + 1] = g;
    rgba[j + 2] = g;
    rgba[j + 3] = 255;
  }
  return jsQR(rgba, info.width, info.height);
}

const png = await QRCode.toBuffer(PAYLOAD, {
  type: "png",
  width: SIZE,
  margin: MARGIN,
  errorCorrectionLevel: "H",
  color: { dark: "#000000", light: "#ffffff" },
});

const decoded = await decodePngBuffer(png);
if (!decoded?.data || decoded.data.trim() !== PAYLOAD) {
  console.error("VERIFY FAILED: expected", PAYLOAD, "got", decoded?.data ?? "(no decode)");
  process.exit(1);
}

writeFileSync(OUT_PRIMARY, png);
copyFileSync(OUT_PRIMARY, OUT_LEGACY);

console.log(`Verified decode: ${decoded.data}`);
console.log(`Wrote ${OUT_PRIMARY} (${png.length} bytes, ${SIZE}px, margin ${MARGIN})`);
console.log(`Copied to ${OUT_LEGACY}`);
