import type { EventArtworkKind } from "@/lib/client/eventArtwork";

export type EventArtworkFit = "contain" | "cover";

/**
 * Discovery-card image fit.
 * Flyers/posters/logos must stay fully visible (contain). Athletics photography
 * may use cover when the asset is landscape. When uncertain, prefer contain so
 * event text and graphics are never cropped away.
 */
export function resolveEventArtworkFit(input: {
  artworkKind: EventArtworkKind;
  source?: string | null;
  sport?: string | null;
  /** naturalWidth / naturalHeight once the image has loaded */
  naturalAspect?: number | null;
}): EventArtworkFit {
  if (input.artworkKind === "fallback") return "contain";

  const source = (input.source ?? "").trim().toLowerCase();
  const athletics = source === "athletics" || Boolean(input.sport?.trim());
  const aspect =
    typeof input.naturalAspect === "number" && Number.isFinite(input.naturalAspect) && input.naturalAspect > 0
      ? input.naturalAspect
      : null;

  if (athletics) {
    // Portrait athletics posters (game-day flyers) still need the full frame.
    if (aspect != null && aspect < 1.05) return "contain";
    return "cover";
  }

  // URInvolved / Fine Arts / campus imports are almost always flyers or logos.
  if (
    !source ||
    source === "urinvolved" ||
    source === "fine_arts" ||
    source === "campus" ||
    source === "manual" ||
    source === "university"
  ) {
    return "contain";
  }

  // Unknown source: preserve the full image rather than cropping information.
  if (aspect != null && aspect >= 1.35) return "cover";
  return "contain";
}
