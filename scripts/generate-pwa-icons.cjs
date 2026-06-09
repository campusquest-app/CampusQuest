/**
 * Generate PWA, favicon, Next.js app icons, and Expo mobile assets from public/campusquest-logo.png
 * Run: node scripts/generate-pwa-icons.cjs
 */
const path = require("path");
const fs = require("fs");

async function writeContainedIcon(sharp, logoPath, outPath, w, h) {
  await sharp(logoPath)
    .resize(w, h, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toFile(outPath);
}

async function writeSolidBackground(outPath, w, h, color) {
  const sharp = require("sharp");
  await sharp({
    create: {
      width: w,
      height: h,
      channels: 4,
      background: color,
    },
  })
    .png()
    .toFile(outPath);
}

async function main() {
  const sharp = require("sharp");
  const root = path.join(__dirname, "..");
  const publicDir = path.join(root, "public");
  const appDir = path.join(root, "app");
  const logoPath = path.join(publicDir, "campusquest-logo.png");

  if (!fs.existsSync(logoPath)) {
    console.error("Source logo not found:", logoPath);
    process.exit(1);
  }

  const webIcons = [
    [192, 192, path.join(publicDir, "icon-192x192.png")],
    [512, 512, path.join(publicDir, "icon-512x512.png")],
    [180, 180, path.join(publicDir, "apple-icon.png")],
    [32, 32, path.join(publicDir, "favicon.png")],
    [512, 512, path.join(appDir, "icon.png")],
    [180, 180, path.join(appDir, "apple-icon.png")],
  ];

  for (const [w, h, outPath] of webIcons) {
    await writeContainedIcon(sharp, logoPath, outPath, w, h);
    console.log("Created", path.relative(root, outPath), `(${w}x${h})`);
  }

  const mobileDirs = [
    path.join(root, "mobile/assets/images"),
    path.join(root, "mobile/mobile/assets/images"),
  ];

  const navy = { r: 10, g: 31, b: 68, alpha: 1 };

  for (const mobileDir of mobileDirs) {
    if (!fs.existsSync(mobileDir)) continue;

    await writeContainedIcon(sharp, logoPath, path.join(mobileDir, "icon.png"), 1024, 1024);
    await writeContainedIcon(sharp, logoPath, path.join(mobileDir, "splash-icon.png"), 512, 512);
    await writeContainedIcon(sharp, logoPath, path.join(mobileDir, "favicon.png"), 48, 48);
    await writeContainedIcon(sharp, logoPath, path.join(mobileDir, "android-icon-foreground.png"), 432, 432);
    await writeContainedIcon(sharp, logoPath, path.join(mobileDir, "android-icon-monochrome.png"), 432, 432);
    await writeSolidBackground(path.join(mobileDir, "android-icon-background.png"), 432, 432, navy);
    console.log("Updated mobile assets in", path.relative(root, mobileDir));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
