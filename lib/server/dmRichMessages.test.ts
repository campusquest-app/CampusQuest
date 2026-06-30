import { describe, expect, it } from "vitest";
import { buildDirectMessagePreviewText } from "./dmRichMessages";

describe("buildDirectMessagePreviewText", () => {
  it("returns photo label for image-only messages", () => {
    expect(
      buildDirectMessagePreviewText({ type: "image", content: "📷 Photo", imageUrl: "https://x/y.jpg" }),
    ).toBe("📷 Photo");
  });

  it("returns caption for image with text", () => {
    expect(
      buildDirectMessagePreviewText({ type: "image", content: "Check this out", imageUrl: "https://x/y.jpg" }),
    ).toBe("Check this out");
  });

  it("returns shared post label", () => {
    expect(buildDirectMessagePreviewText({ type: "shared_post", content: "Shared a post" })).toBe("Shared a post");
  });

  it("returns plain text for text messages", () => {
    expect(buildDirectMessagePreviewText({ type: "text", content: "Hey!" })).toBe("Hey!");
  });

  it("returns voice label for audio messages", () => {
    expect(buildDirectMessagePreviewText({ type: "audio", content: "🎤 Voice message" })).toBe("🎤 Voice message");
  });
});
