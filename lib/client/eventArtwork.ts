import { CAMPUSQUEST_LOGO_SRC } from "@/lib/branding";

/** Official Rhode Island Rams mark. Transparent PNG, shown on navy when a URI event has no artwork. */
export const URI_RAMS_EVENT_FALLBACK_SRC = "/brand/uri-rams-ri.png";

/** CampusQuest wordmark for non-URI imported events without artwork. */
export const CAMPUSQUEST_EVENT_FALLBACK_SRC = CAMPUSQUEST_LOGO_SRC;

export type EventArtworkKind = "event" | "banner" | "fallback";
export type EventArtworkFallbackBrand = "uri" | "campusquest";

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

export function resolveEventFallbackSrc(brand: EventArtworkFallbackBrand = "uri"): string {
  return brand === "campusquest" ? CAMPUSQUEST_EVENT_FALLBACK_SRC : URI_RAMS_EVENT_FALLBACK_SRC;
}

function isFallbackSrc(src: string): boolean {
  return (
    src === URI_RAMS_EVENT_FALLBACK_SRC ||
    src === CAMPUSQUEST_EVENT_FALLBACK_SRC ||
    src.endsWith(URI_RAMS_EVENT_FALLBACK_SRC) ||
    src.endsWith(CAMPUSQUEST_EVENT_FALLBACK_SRC) ||
    src.endsWith("/campusquest-logo.png")
  );
}

const URI_EVENT_SOURCES = new Set([
  "urinvolved",
  "athletics",
  "uri",
  "fine_arts",
  "campus",
  "university",
]);

/**
 * URI-affiliated sources keep the Rams mark; other imported sources use CampusQuest branding.
 * Campus-created events are always URI-affiliated.
 */
export function eventArtworkFallbackBrand(input: {
  kind?: "campus" | "external";
  source?: string | null;
  sport?: string | null;
}): EventArtworkFallbackBrand {
  if (input.kind === "campus") return "uri";
  const source = (input.source ?? "").trim().toLowerCase();
  if (!source || URI_EVENT_SOURCES.has(source)) return "uri";
  if (source.includes("uri") || source.includes("rhode")) return "uri";
  if (input.sport?.trim()) return "uri";
  return "campusquest";
}

/**
 * 1. Real event image
 * 2. Provider or banner image
 * 3. Brand fallback (Rams or CampusQuest)
 */
export function resolveEventArtwork(input: {
  imageUrl?: string | null;
  bannerUrl?: string | null;
  fallbackBrand?: EventArtworkFallbackBrand;
}): EventArtworkChoice {
  const image = usableEventImageUrl(input.imageUrl);
  if (image && !isFallbackSrc(image)) return { src: image, kind: "event" };
  const banner = usableEventImageUrl(input.bannerUrl);
  if (banner && !isFallbackSrc(banner)) return { src: banner, kind: "banner" };
  return { src: resolveEventFallbackSrc(input.fallbackBrand ?? "uri"), kind: "fallback" };
}

/** After a load error, try the unused banner, then the brand fallback. */
export function eventArtworkAfterError(input: {
  failedKind: EventArtworkKind;
  imageUrl?: string | null;
  bannerUrl?: string | null;
  fallbackBrand?: EventArtworkFallbackBrand;
}): EventArtworkChoice {
  if (input.failedKind === "event") {
    const banner = usableEventImageUrl(input.bannerUrl);
    const image = usableEventImageUrl(input.imageUrl);
    if (banner && banner !== image && !isFallbackSrc(banner)) {
      return { src: banner, kind: "banner" };
    }
  }
  return { src: resolveEventFallbackSrc(input.fallbackBrand ?? "uri"), kind: "fallback" };
}
