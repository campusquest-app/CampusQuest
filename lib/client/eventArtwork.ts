/** Official Rhode Island Rams mark. Transparent PNG, shown on navy when an event has no artwork. */
export const URI_RAMS_EVENT_FALLBACK_SRC = "/brand/uri-rams-ri.png";

export type EventArtworkKind = "event" | "banner" | "fallback";

export type EventArtworkChoice = {
  src: string;
  kind: EventArtworkKind;
};

const UNUSABLE = new Set(["null", "undefined", "none", "n/a"]);

/** A non-empty http(s), site-relative, or blob URL. Blank and sentinel strings are missing. */
export function usableEventImageUrl(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || UNUSABLE.has(trimmed.toLowerCase())) return null;
  if (/^(javascript|data):/i.test(trimmed)) return null;
  return trimmed;
}

function isFallbackSrc(src: string): boolean {
  return src === URI_RAMS_EVENT_FALLBACK_SRC || src.endsWith(URI_RAMS_EVENT_FALLBACK_SRC);
}

/**
 * 1. Real event image
 * 2. Provider or banner image
 * 3. Rhode Island Rams logo
 */
export function resolveEventArtwork(input: {
  imageUrl?: string | null;
  bannerUrl?: string | null;
}): EventArtworkChoice {
  const image = usableEventImageUrl(input.imageUrl);
  if (image && !isFallbackSrc(image)) return { src: image, kind: "event" };
  const banner = usableEventImageUrl(input.bannerUrl);
  if (banner && !isFallbackSrc(banner)) return { src: banner, kind: "banner" };
  return { src: URI_RAMS_EVENT_FALLBACK_SRC, kind: "fallback" };
}

/** After a load error, try the unused banner, then the Rams logo. */
export function eventArtworkAfterError(input: {
  failedKind: EventArtworkKind;
  imageUrl?: string | null;
  bannerUrl?: string | null;
}): EventArtworkChoice {
  if (input.failedKind === "event") {
    const banner = usableEventImageUrl(input.bannerUrl);
    const image = usableEventImageUrl(input.imageUrl);
    if (banner && banner !== image && !isFallbackSrc(banner)) {
      return { src: banner, kind: "banner" };
    }
  }
  return { src: URI_RAMS_EVENT_FALLBACK_SRC, kind: "fallback" };
}
