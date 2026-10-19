/**
 * Stable feed media box sizing from stored width/height.
 * Reserves space before decode so Mobile Safari does not collapse to a 0-height strip
 * or jump (CLS) once the image/video intrinsic size arrives.
 */

/** Matches `.cq-quad-media-carousel` / feed CSS budget (~55–60% viewport). */
export const QUAD_FEED_MEDIA_MAX_HEIGHT_CSS = "min(58dvh, 56svh, 520px)";

/** Used when dimensions are unknown — Instagram-like portrait frame, not full viewport. */
export const QUAD_FEED_MEDIA_FALLBACK_ASPECT = "4 / 5";

/** Tallest portrait frame allowed in the feed (width:height). */
export const QUAD_FEED_MEDIA_MAX_PORTRAIT_AR = 4 / 5;

export type QuadMediaDimensions = {
  width?: number | null;
  height?: number | null;
};

/** True when both edges are finite and positive. */
export function hasUsableMediaDimensions(
  width: number | null | undefined,
  height: number | null | undefined,
): boolean {
  return (
    typeof width === "number" &&
    typeof height === "number" &&
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    width > 0 &&
    height > 0
  );
}

/**
 * CSS `aspect-ratio` for the feed frame.
 * Portrait media taller than 4:5 is clamped so tall uploads do not dominate the viewport;
 * landscape and square keep their natural proportions.
 */
export function feedMediaAspectRatioCss(
  width?: number | null,
  height?: number | null,
): string {
  if (!hasUsableMediaDimensions(width, height)) return QUAD_FEED_MEDIA_FALLBACK_ASPECT;
  const w = width as number;
  const h = height as number;
  // height/width > 5/4 means taller than 4:5 → clamp the frame.
  if (h / w > 1 / QUAD_FEED_MEDIA_MAX_PORTRAIT_AR) {
    return QUAD_FEED_MEDIA_FALLBACK_ASPECT;
  }
  return `${Math.round(w)} / ${Math.round(h)}`;
}

/**
 * Inline style for a feed media frame: full width, capped height, stable aspect ratio.
 * Height is driven by aspect-ratio until max-height clamps tall portraits.
 */
export function feedMediaFrameStyle(
  width?: number | null,
  height?: number | null,
  opts?: { fillParent?: boolean },
): {
  width: "100%";
  maxWidth: "100%";
  maxHeight: string;
  aspectRatio: string;
  height?: "100%";
  ["--cq-media-ar"]: string;
  ["--cq-feed-media-max-h"]: string;
} {
  const aspectRatio = feedMediaAspectRatioCss(width, height);
  if (opts?.fillParent) {
    return {
      width: "100%",
      maxWidth: "100%",
      maxHeight: "100%",
      height: "100%",
      aspectRatio: "auto",
      ["--cq-media-ar"]: aspectRatio,
      ["--cq-feed-media-max-h"]: QUAD_FEED_MEDIA_MAX_HEIGHT_CSS,
    };
  }
  return {
    width: "100%",
    maxWidth: "100%",
    maxHeight: QUAD_FEED_MEDIA_MAX_HEIGHT_CSS,
    aspectRatio,
    ["--cq-media-ar"]: aspectRatio,
    ["--cq-feed-media-max-h"]: QUAD_FEED_MEDIA_MAX_HEIGHT_CSS,
  };
}

/**
 * Expected laid-out height (px) for measurements / tests at a given container width.
 * Mirrors CSS: min(width / aspect, maxHeightPx) with 4:5 portrait clamp.
 */
export function expectedFeedMediaHeightPx(args: {
  containerWidth: number;
  width?: number | null;
  height?: number | null;
  maxHeightPx: number;
}): number {
  const { containerWidth, maxHeightPx } = args;
  if (!(containerWidth > 0) || !(maxHeightPx > 0)) return 0;
  const arCss = feedMediaAspectRatioCss(args.width, args.height);
  // Parse "W / H"
  const parts = arCss.split("/").map((p) => Number(p.trim()));
  const aw = parts[0];
  const ah = parts[1];
  if (!(aw! > 0) || !(ah! > 0)) {
    return Math.min(maxHeightPx, (containerWidth * 5) / 4);
  }
  const natural = (containerWidth * ah!) / aw!;
  return Math.min(maxHeightPx, natural);
}

export function isPortraitMedia(width?: number | null, height?: number | null): boolean {
  if (!hasUsableMediaDimensions(width, height)) return true;
  return (height as number) >= (width as number);
}

export function isLandscapeMedia(width?: number | null, height?: number | null): boolean {
  if (!hasUsableMediaDimensions(width, height)) return false;
  return (width as number) > (height as number);
}
