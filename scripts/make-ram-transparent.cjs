/**
 * High-quality white-background removal for splash Ram mascot.
 * Run: npm run ram:transparent
 *
 * Input (first found): uploaded asset, public/campusquest-splash-ram.png
 * Output: public/assets/ram-transparent.png
 */
const fs = require("fs");
const path = require("path");

const SOURCES = [
  path.join(
    __dirname,
    "..",
    "..",
    ".cursor",
    "projects",
    "Users-nicklockhart-campusquest",
    "assets",
    "image-d313c875-bdb2-4c82-a26a-a448dd7217dd.png",
  ),
  path.join(__dirname, "..", "public", "campusquest-splash-ram.png"),
];

const OUT_DIR = path.join(__dirname, "..", "public", "assets");
const OUT_PATH = path.join(OUT_DIR, "ram-transparent.png");

function saturation(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === 0) return 0;
  return (max - min) / max;
}

function luminance(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Pixels reachable from image edges through near-white, low-saturation areas. */
function floodBackgroundMask(data, width, height, channels) {
  const bg = new Uint8Array(width * height);
  const queue = [];

  function isBgPixel(r, g, b) {
    const sat = saturation(r, g, b);
    const lum = luminance(r, g, b);
    const dist = Math.hypot(255 - r, 255 - g, 255 - b);
    if (lum > 248 && sat < 0.14) return true;
    if (lum > 235 && sat < 0.1 && dist < 40) return true;
    if (dist < 22) return true;
    return false;
  }

  function tryPush(x, y) {
    const idx = y * width + x;
    if (bg[idx]) return;
    const i = idx * channels;
    if (!isBgPixel(data[i], data[i + 1], data[i + 2])) return;
    bg[idx] = 1;
    queue.push(idx);
  }

  for (let x = 0; x < width; x++) {
    tryPush(x, 0);
    tryPush(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    tryPush(0, y);
    tryPush(width - 1, y);
  }

  while (queue.length > 0) {
    const idx = queue.pop();
    const x = idx % width;
    const y = (idx / width) | 0;
    if (x > 0) tryPush(x - 1, y);
    if (x < width - 1) tryPush(x + 1, y);
    if (y > 0) tryPush(x, y - 1);
    if (y < height - 1) tryPush(x, y + 1);
  }

  return bg;
}

function edgeAlpha(data, width, height, channels, bg, x, y) {
  const idx = y * width + x;
  if (bg[idx]) return 0;

  let minDist = 999;
  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const nidx = ny * width + nx;
      if (!bg[nidx]) continue;
      const d = Math.hypot(dx, dy);
      if (d < minDist) minDist = d;
    }
  }

  if (minDist > 3) return 255;
  const t = Math.max(0, Math.min(1, (minDist - 0.5) / 2.5));
  return Math.round(t * 255);
}

function spillSuppression(data, width, height, channels, x, y) {
  const i = (y * width + x) * channels;
  const a = data[i + 3];
  if (a === 0 || a === 255) return;

  const t = a / 255;
  if (t < 0.05) {
    data[i + 3] = 0;
    return;
  }

  const r = data[i];
  const g = data[i + 1];
  const b = data[i + 2];
  const lum = luminance(r, g, b);
  const sat = saturation(r, g, b);

  if (lum > 200 && sat < 0.25) {
    const inv = 1 / t;
    data[i] = Math.min(255, Math.round(r * inv));
    data[i + 1] = Math.min(255, Math.round(g * inv));
    data[i + 2] = Math.min(255, Math.round(b * inv));
  }
}

function punchAlpha(data, width, height, channels) {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      let a = data[i + 3];
      if (a <= 12) {
        data[i + 3] = 0;
        data[i] = 0;
        data[i + 1] = 0;
        data[i + 2] = 0;
        continue;
      }
      if (a >= 200) {
        data[i + 3] = 255;
        continue;
      }
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const sat = saturation(r, g, b);
      if (sat > 0.08 || luminance(r, g, b) < 240) {
        data[i + 3] = 255;
      }
    }
  }
}

async function main() {
  const sharp = require("sharp");

  const source = SOURCES.find((p) => fs.existsSync(p));
  if (!source) {
    console.error("No Ram source image found.");
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  const bg = floodBackgroundMask(data, width, height, channels);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      if (bg[y * width + x]) {
        data[i + 3] = 0;
        continue;
      }
      data[i + 3] = edgeAlpha(data, width, height, channels, bg, x, y);
    }
  }

  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        spillSuppression(data, width, height, channels, x, y);
      }
    }
  }

  punchAlpha(data, width, height, channels);

  const tmpPath = path.join(OUT_DIR, "ram-transparent.tmp.png");
  await sharp(data, { raw: { width, height, channels } })
    .png({ compressionLevel: 9, effort: 10 })
    .toFile(tmpPath);

  await sharp(tmpPath).trim({ threshold: 12 }).png().toFile(OUT_PATH);
  fs.unlinkSync(tmpPath);

  const meta = await sharp(OUT_PATH).metadata();
  console.log("Wrote", OUT_PATH, `(${meta.width}x${meta.height}) from`, source);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
