/**
 * Process the official CampusQuest logo: transparent background, preserve proportions.
 * Usage: node scripts/process-logo.mjs
 */
import sharp from "sharp";
import { existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const OFFICIAL_LOGO_CANDIDATES = [
  join(
    root,
    "../.cursor/projects/Users-nicklockhart-campusquest/assets/FInal_Campus_Quest_Logos_Empty_Shoulder-77c9e688-eb5f-42e5-9f2a-4226cde53072.png",
  ),
  join(root, "public/campusquest-logo.png"),
];

const outPath = join(root, "public/campusquest-logo.png");

function resolveInputPath() {
  for (const candidate of OFFICIAL_LOGO_CANDIDATES) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error("Official CampusQuest logo source not found.");
}

async function main() {
  const inputPath = resolveInputPath();
  const image = sharp(inputPath);
  const meta = await image.metadata();
  const maxWidth = 1024;
  const targetWidth = meta.width && meta.width > maxWidth ? maxWidth : meta.width;

  let buffer = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  const { data, info } = buffer;
  const { width: w, height: h, channels } = info;
  const pixelCount = w * h;

  // Make black / near-black pixels transparent (official asset ships on black).
  const threshold = 40;
  for (let i = 0; i < pixelCount; i++) {
    const r = data[i * channels + 0];
    const g = data[i * channels + 1];
    const b = data[i * channels + 2];
    if (r <= threshold && g <= threshold && b <= threshold) {
      data[i * channels + 3] = 0;
    }
  }

  let pipeline = sharp(data, {
    raw: {
      width: w,
      height: h,
      channels: 4,
    },
  }).png();

  if (targetWidth && targetWidth < w) {
    pipeline = pipeline.resize(targetWidth, null, { withoutEnlargement: true });
  }

  await pipeline.toFile(outPath);
  console.log("Logo written to public/campusquest-logo.png (transparent bg, proportions preserved)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
