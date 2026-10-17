/**
 * Responsive Quad feed image URLs using existing hosts (Supabase Storage render
 * and/or Next.js image optimizer). Always keeps the original as a fallback.
 */

export const QUAD_FEED_IMAGE_WIDTHS = [360, 720, 1080] as const;
export type QuadFeedImageWidth = (typeof QUAD_FEED_IMAGE_WIDTHS)[number];

const OBJECT_PUBLIC =
  /^(https?:\/\/[^/]+)\/storage\/v1\/object\/public\/([^/]+)\/(.+?)(?:\?|#|$)/i;
const RENDER_PUBLIC =
  /^(https?:\/\/[^/]+)\/storage\/v1\/render\/image\/public\/([^/]+)\/(.+?)(?:\?|#|$)/i;

export type QuadFeedImageSources = {
  /** Best single URL for the requested display width (may be optimized). */
  src: string;
  /** Original storage / CDN URL — use on error or when transforms are unavailable. */
  fallbackSrc: string;
  srcSet: string | undefined;
  sizes: string;
  /** True when src/srcSet use an optimizer/transform, not the raw file. */
  usesVariant: boolean;
};

function stripQuery(path: string): string {
  return path.replace(/[?#].*$/, "");
}

/**
 * Rewrite a public Supabase object URL to the image transformation endpoint.
 * No-op for non-Supabase URLs. Callers must fall back if the project has
 * transforms disabled (onError → fallbackSrc).
 */
export function toSupabaseImageTransformUrl(
  url: string,
  width: number,
  quality = 72,
): string | null {
  const trimmed = url.trim();
  if (!trimmed || !(width > 0)) return null;

  let origin: string;
  let bucket: string;
  let objectPath: string;

  const render = RENDER_PUBLIC.exec(trimmed);
  const object = OBJECT_PUBLIC.exec(trimmed);
  if (render) {
    origin = render[1]!;
    bucket = render[2]!;
    objectPath = stripQuery(decodeURIComponent(render[3]!));
  } else if (object) {
    origin = object[1]!;
    bucket = object[2]!;
    objectPath = stripQuery(decodeURIComponent(object[3]!));
  } else {
    return null;
  }

  // Skip non-raster paths (e.g. raw videos under the same bucket).
  if (!/\.(jpe?g|png|gif|webp|heic|heif)$/i.test(objectPath) && !/\/poster\./i.test(objectPath)) {
    // Still allow extensionless image objects in quad-post-images (legacy).
    if (!/quad-post-images/i.test(bucket)) return null;
  }

  const params = new URLSearchParams({
    width: String(Math.round(width)),
    resize: "contain",
    quality: String(Math.min(100, Math.max(40, Math.round(quality)))),
  });
  return `${origin}/storage/v1/render/image/public/${bucket}/${objectPath}?${params.toString()}`;
}

/** Same-origin Next.js optimizer URL (works for Capacitor → production host). */
export function toNextImageOptimizerUrl(url: string, width: number, quality = 72): string | null {
  const trimmed = url.trim();
  if (!trimmed || !(width > 0)) return null;
  if (!/^https?:\/\//i.test(trimmed) && !trimmed.startsWith("/")) return null;
  // Avoid double-wrapping.
  if (trimmed.includes("/_next/image?")) return trimmed;
  const w = QUAD_FEED_IMAGE_WIDTHS.includes(width as QuadFeedImageWidth)
    ? width
    : pickFeedImageWidth(width);
  return `/_next/image?url=${encodeURIComponent(trimmed)}&w=${w}&q=${Math.min(100, Math.max(1, Math.round(quality)))}`;
}

export function pickFeedImageWidth(displayWidthPx: number): QuadFeedImageWidth {
  const dpr =
    typeof window !== "undefined" && Number.isFinite(window.devicePixelRatio)
      ? Math.min(3, Math.max(1, window.devicePixelRatio))
      : 2;
  const need = Math.ceil(Math.max(1, displayWidthPx) * dpr);
  for (const w of QUAD_FEED_IMAGE_WIDTHS) {
    if (w >= need) return w;
  }
  return 1080;
}

/**
 * Build src / srcSet for a feed image. Prefers Supabase transforms when the URL
 * is a public storage object; otherwise uses the Next optimizer for http(s) URLs.
 * `fallbackSrc` is always the original.
 */
export function buildQuadFeedImageSources(
  url: string,
  opts?: { displayWidthPx?: number; quality?: number; sizes?: string },
): QuadFeedImageSources {
  const fallbackSrc = url.trim();
  const quality = opts?.quality ?? 72;
  const displayWidthPx = opts?.displayWidthPx ?? 390;
  const sizes = opts?.sizes ?? "(max-width: 640px) 100vw, min(640px, 100vw)";
  if (!fallbackSrc) {
    return { src: "", fallbackSrc: "", srcSet: undefined, sizes, usesVariant: false };
  }

  const target = pickFeedImageWidth(displayWidthPx);
  const entries: Array<{ w: number; href: string }> = [];

  for (const w of QUAD_FEED_IMAGE_WIDTHS) {
    const supabase = toSupabaseImageTransformUrl(fallbackSrc, w, quality);
    if (supabase) {
      entries.push({ w, href: supabase });
      continue;
    }
    const next = toNextImageOptimizerUrl(fallbackSrc, w, quality);
    if (next) entries.push({ w, href: next });
  }

  if (entries.length === 0) {
    return { src: fallbackSrc, fallbackSrc, srcSet: undefined, sizes, usesVariant: false };
  }

  const primary =
    entries.find((e) => e.w === target)?.href ?? entries[entries.length - 1]!.href;
  const srcSet = entries.map((e) => `${e.href} ${e.w}w`).join(", ");
  return {
    src: primary,
    fallbackSrc,
    srcSet,
    sizes,
    usesVariant: primary !== fallbackSrc,
  };
}
