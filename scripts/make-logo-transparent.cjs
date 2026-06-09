/**
 * Re-process transparency on public/campusquest-logo.png (legacy helper).
 * Prefer: npm run logo:process
 */
const path = require("path");
const fs = require("fs");

async function main() {
  const sharp = require("sharp");
  const publicDir = path.join(__dirname, "..", "public");
  const logoPath = path.join(publicDir, "campusquest-logo.png");

  if (!fs.existsSync(logoPath)) {
    console.error("Logo not found:", logoPath);
    process.exit(1);
  }

  const img = sharp(logoPath);
  const { data, info } = await img
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  // Soft transition: full transparent below low, full opacity above high, smooth ramp between
  const low = 28;
  const high = 72;

  for (let i = 0; i < data.length; i += channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    const brightness = Math.max(r, g, b);
    if (brightness <= low) {
      data[i + 3] = 0;
    } else if (brightness < high) {
      // Smooth ramp for clean anti-aliased edge
      const t = (brightness - low) / (high - low);
      const smooth = t * t * (3 - 2 * t); // smoothstep
      data[i + 3] = Math.round((a / 255) * smooth * 255);
    }
    // else: keep original alpha (foreground stays solid)
  }

  await sharp(data, {
    raw: { width, height, channels },
  })
    .png()
    .toFile(logoPath);

  console.log("Updated", logoPath, "with transparent background (soft edge).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
