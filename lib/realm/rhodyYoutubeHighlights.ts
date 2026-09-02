/**
 * Curated URI / Rhody YouTube highlights for Realm discovery.
 * Add another entry (or pass a watch URL / video ID) to surface more videos.
 */

export type RhodyYoutubeHighlightSource = {
  youtubeVideoId: string;
  title: string;
  /** Sport / category label shown above the title (e.g. Football, Rhody). */
  category: string;
  /** Only set when a real duration is known — never invent. */
  duration?: string | null;
};

const YOUTUBE_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

/** Seed catalog — extend this list to add more Rhody YouTube rows. */
export const RHODY_YOUTUBE_HIGHLIGHTS: readonly RhodyYoutubeHighlightSource[] = [
  {
    youtubeVideoId: "WeztHt4UU_U",
    title: "The Rams are Coming - Short",
    category: "Rhody",
    duration: null,
  },
  {
    youtubeVideoId: "Ry_Hpfz-K40",
    title: "In The Library",
    category: "Rhody",
    duration: null,
  },
];

export function parseYoutubeVideoId(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  if (YOUTUBE_ID_RE.test(raw)) return raw;

  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^www\./, "");
    if (host === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0] ?? "";
      return YOUTUBE_ID_RE.test(id) ? id : null;
    }
    if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
      const fromQuery = url.searchParams.get("v");
      if (fromQuery && YOUTUBE_ID_RE.test(fromQuery)) return fromQuery;
      const parts = url.pathname.split("/").filter(Boolean);
      if ((parts[0] === "embed" || parts[0] === "shorts" || parts[0] === "live") && parts[1] && YOUTUBE_ID_RE.test(parts[1])) {
        return parts[1];
      }
    }
  } catch {
    /* not a URL */
  }
  return null;
}

export function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export function youtubeThumbnailUrl(videoId: string, quality: "maxresdefault" | "hqdefault" = "maxresdefault"): string {
  return `https://img.youtube.com/vi/${videoId}/${quality}.jpg`;
}

export function youtubeThumbnailFallbackUrl(videoId: string): string {
  return youtubeThumbnailUrl(videoId, "hqdefault");
}

/**
 * Build a highlight from a YouTube URL or 11-char video ID.
 * Optional overrides let callers set title/category/duration without a paid API.
 */
export function createRhodyYoutubeHighlight(
  urlOrId: string,
  overrides?: Partial<Pick<RhodyYoutubeHighlightSource, "title" | "category" | "duration">>,
): RhodyYoutubeHighlightSource | null {
  const youtubeVideoId = parseYoutubeVideoId(urlOrId);
  if (!youtubeVideoId) return null;
  return {
    youtubeVideoId,
    title: overrides?.title?.trim() || "Rhody highlight",
    category: overrides?.category?.trim() || "Rhody",
    duration: overrides?.duration ?? null,
  };
}
