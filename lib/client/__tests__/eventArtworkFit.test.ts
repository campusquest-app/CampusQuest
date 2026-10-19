import { describe, expect, it } from "vitest";
import { resolveEventArtworkFit } from "@/lib/client/eventArtworkFit";

describe("resolveEventArtworkFit", () => {
  it("contains flyers, logos, and URInvolved posters by default", () => {
    expect(
      resolveEventArtworkFit({ artworkKind: "event", source: "urinvolved" }),
    ).toBe("contain");
    expect(
      resolveEventArtworkFit({ artworkKind: "event", source: "fine_arts" }),
    ).toBe("contain");
    expect(
      resolveEventArtworkFit({ artworkKind: "event", source: "manual" }),
    ).toBe("contain");
    expect(resolveEventArtworkFit({ artworkKind: "fallback", source: "athletics" })).toBe(
      "contain",
    );
  });

  it("covers landscape athletics photography but contains portrait game posters", () => {
    expect(
      resolveEventArtworkFit({
        artworkKind: "event",
        source: "athletics",
        sport: "Basketball",
        naturalAspect: 1.6,
      }),
    ).toBe("cover");
    expect(
      resolveEventArtworkFit({
        artworkKind: "event",
        source: "athletics",
        sport: "Basketball",
        naturalAspect: 0.7,
      }),
    ).toBe("contain");
  });

  it("defaults unknown sources to contain so flyer text is never cropped", () => {
    expect(resolveEventArtworkFit({ artworkKind: "event", source: "partner-x" })).toBe(
      "contain",
    );
    expect(
      resolveEventArtworkFit({
        artworkKind: "event",
        source: "partner-x",
        naturalAspect: 1.5,
      }),
    ).toBe("cover");
  });
});
