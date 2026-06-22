/** DiceBear framing tuned for full-bleed circular avatars (object-fit: cover behavior). */
export const DICEBEAR_RENDER_SIZE = 128;

export const DICEBEAR_SAFE_FRAME = {
  size: DICEBEAR_RENDER_SIZE,
  scale: 100,
  translateX: 0,
  translateY: 0,
  radius: 50,
} as const;

const FRAME_OPTION_KEYS = new Set(["size", "scale", "translateX", "translateY", "radius", "clip"]);

export function clampDiceBearScale(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DICEBEAR_SAFE_FRAME.scale;
  if (value > 100) return 100;
  if (value < 80) return DICEBEAR_SAFE_FRAME.scale;
  return Math.round(value);
}

/** Strip framing keys — appearance options (hair, eyes, background, etc.) pass through. */
export function diceBearAppearanceOptions(options: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!options) return {};
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(options)) {
    if (!FRAME_OPTION_KEYS.has(key)) out[key] = val;
  }
  return out;
}

export function buildDiceBearCreateOptions(args: {
  seed: string;
  options?: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    seed: args.seed,
    ...diceBearAppearanceOptions(args.options),
    size: DICEBEAR_SAFE_FRAME.size,
    scale: clampDiceBearScale(args.options?.scale),
    translateX: DICEBEAR_SAFE_FRAME.translateX,
    translateY: DICEBEAR_SAFE_FRAME.translateY,
    radius: DICEBEAR_SAFE_FRAME.radius,
  };
}

/** Remove clip paths that can crop faces when the SVG is scaled into a circle. */
export function stripSvgClipPaths(svg: string): string {
  if (!/<clipPath/i.test(svg)) return svg;
  return svg
    .replace(/\sclip-path="url\([^"]+\)"/gi, "")
    .replace(/<clipPath\b[^>]*>[\s\S]*?<\/clipPath>/gi, "");
}
