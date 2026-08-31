import { describe, expect, it } from "vitest";
import {
  createRhodyYoutubeHighlight,
  parseYoutubeVideoId,
  RHODY_YOUTUBE_HIGHLIGHTS,
  youtubeThumbnailFallbackUrl,
  youtubeThumbnailUrl,
  youtubeWatchUrl,
} from "@/lib/realm/rhodyYoutubeHighlights";

describe("rhody YouTube highlights", () => {
  it("parses watch URLs, short links, and bare ids", () => {
    expect(parseYoutubeVideoId("WeztHt4UU_U")).toBe("WeztHt4UU_U");
    expect(parseYoutubeVideoId("https://www.youtube.com/watch?v=WeztHt4UU_U")).toBe("WeztHt4UU_U");
    expect(parseYoutubeVideoId("https://youtu.be/WeztHt4UU_U")).toBe("WeztHt4UU_U");
    expect(parseYoutubeVideoId("https://www.youtube.com/shorts/WeztHt4UU_U")).toBe("WeztHt4UU_U");
    expect(parseYoutubeVideoId("not-valid")).toBeNull();
    expect(parseYoutubeVideoId("")).toBeNull();
  });

  it("builds thumbnail and watch URLs for the curated Rams short", () => {
    const seeded = RHODY_YOUTUBE_HIGHLIGHTS.find((row) => row.youtubeVideoId === "WeztHt4UU_U");
    expect(seeded?.title).toMatch(/Rams are Coming/i);
    expect(youtubeWatchUrl("WeztHt4UU_U")).toBe("https://www.youtube.com/watch?v=WeztHt4UU_U");
    expect(youtubeThumbnailUrl("WeztHt4UU_U")).toBe("https://img.youtube.com/vi/WeztHt4UU_U/maxresdefault.jpg");
    expect(youtubeThumbnailFallbackUrl("WeztHt4UU_U")).toBe("https://img.youtube.com/vi/WeztHt4UU_U/hqdefault.jpg");
  });

  it("seeds In The Library with the provided YouTube id and thumbnail", () => {
    const seeded = RHODY_YOUTUBE_HIGHLIGHTS.find((row) => row.youtubeVideoId === "Ry_Hpfz-K40");
    expect(seeded).toEqual({
      youtubeVideoId: "Ry_Hpfz-K40",
      title: "In The Library",
      category: "Rhody",
      duration: null,
    });
    expect(youtubeWatchUrl("Ry_Hpfz-K40")).toBe("https://www.youtube.com/watch?v=Ry_Hpfz-K40");
    expect(youtubeThumbnailUrl("Ry_Hpfz-K40")).toBe("https://img.youtube.com/vi/Ry_Hpfz-K40/maxresdefault.jpg");
    expect(youtubeThumbnailFallbackUrl("Ry_Hpfz-K40")).toBe("https://img.youtube.com/vi/Ry_Hpfz-K40/hqdefault.jpg");
  });

  it("creates reusable highlight rows from a URL", () => {
    const row = createRhodyYoutubeHighlight("https://www.youtube.com/watch?v=WeztHt4UU_U", {
      title: "The Rams are Coming - Short",
      category: "Rhody",
    });
    expect(row).toEqual({
      youtubeVideoId: "WeztHt4UU_U",
      title: "The Rams are Coming - Short",
      category: "Rhody",
      duration: null,
    });
  });
});
