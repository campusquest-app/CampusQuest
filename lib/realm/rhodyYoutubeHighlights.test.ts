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
