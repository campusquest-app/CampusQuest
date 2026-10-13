import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MARKETPLACE_MAX_PHOTOS } from "@/lib/marketplace/policy";
import {
  MARKETPLACE_PHOTO_MAX_BYTES,
  MARKETPLACE_PHOTO_REQUIRED_MESSAGE,
  marketplacePhotoSelectionNotice,
  resolveListingPhotoUrls,
  selectMarketplacePhotos,
} from "@/lib/marketplace/listingPhotos";
import { MarketPhotoPicker } from "@/components/market/MarketPhotoPicker";

const file = (name: string, type: string, size = 1000) => ({ name, type, size });

describe("selectMarketplacePhotos", () => {
  it("keeps images in selection order and rejects non-images", () => {
    const result = selectMarketplacePhotos(0, [
      file("a.jpg", "image/jpeg"),
      file("notes.txt", "text/plain"),
      file("b.heic", ""),
      file("clip.mp4", "video/mp4"),
    ]);
    expect(result.accepted.map((f) => f.name)).toEqual(["a.jpg", "b.heic"]);
    expect(result.notImages).toEqual(["notes.txt", "clip.mp4"]);
    expect(marketplacePhotoSelectionNotice(result)).toBe("2 files weren't images, so they weren't added.");
  });

  it("rejects empty files and files over the upload ceiling", () => {
    const result = selectMarketplacePhotos(0, [
      file("huge.png", "image/png", MARKETPLACE_PHOTO_MAX_BYTES + 1),
      file("empty.png", "image/png", 0),
      file("ok.png", "image/png", MARKETPLACE_PHOTO_MAX_BYTES),
    ]);
    expect(result.accepted.map((f) => f.name)).toEqual(["ok.png"]);
    expect(result.tooLarge).toEqual(["huge.png", "empty.png"]);
  });

  it("never exceeds the listing maximum and says how many were left out", () => {
    const many = Array.from({ length: 6 }, (_, i) => file(`p${i}.png`, "image/png"));
    const result = selectMarketplacePhotos(MARKETPLACE_MAX_PHOTOS - 2, many);
    expect(result.accepted).toHaveLength(2);
    expect(result.overLimit).toBe(4);
    expect(marketplacePhotoSelectionNotice(result)).toBe(
      `You can add up to ${MARKETPLACE_MAX_PHOTOS} photos. 4 photos were left out.`,
    );
    expect(selectMarketplacePhotos(MARKETPLACE_MAX_PHOTOS, [file("x.png", "image/png")]).accepted).toHaveLength(0);
  });

  it("returns no notice for a clean selection", () => {
    expect(marketplacePhotoSelectionNotice(selectMarketplacePhotos(0, [file("a.png", "image/png")]))).toBeNull();
  });
});

describe("resolveListingPhotoUrls", () => {
  it("keeps saved URLs, uploads new files in order, and keeps the cover first", async () => {
    const upload = vi.fn(async (name: string) => `https://cdn.example/${name}`);
    const progress: Array<[number, number]> = [];
    const urls = await resolveListingPhotoUrls(
      [
        { kind: "file", file: "cover.jpg" },
        { kind: "existing", url: "https://cdn.example/saved.jpg" },
        { kind: "file", file: "side.jpg" },
      ],
      { upload, onProgress: (current, total) => progress.push([current, total]) },
    );
    expect(urls).toEqual([
      "https://cdn.example/cover.jpg",
      "https://cdn.example/saved.jpg",
      "https://cdn.example/side.jpg",
    ]);
    expect(upload.mock.calls.map(([name]) => name)).toEqual(["cover.jpg", "side.jpg"]);
    expect(progress).toEqual([
      [1, 2],
      [2, 2],
    ]);
  });

  it("does not upload anything when only saved photos remain", async () => {
    const upload = vi.fn(async () => "never");
    await expect(resolveListingPhotoUrls([{ kind: "existing", url: "u" }], { upload })).resolves.toEqual(["u"]);
    expect(upload).not.toHaveBeenCalled();
  });
});

describe("MarketPhotoPicker", () => {
  const render = (props: Partial<Parameters<typeof MarketPhotoPicker>[0]> = {}) =>
    renderToStaticMarkup(
      createElement(MarketPhotoPicker, {
        photos: [],
        max: MARKETPLACE_MAX_PHOTOS,
        error: null,
        notice: null,
        onAddFiles: () => undefined,
        onRemove: () => undefined,
        ...props,
      }),
    );

  it("renders a labeled real file input for images before anything is selected", () => {
    const html = render();
    expect(html).toContain("Photos");
    expect(html).toContain(`Add up to ${MARKETPLACE_MAX_PHOTOS} photos of your item.`);
    expect(html).toMatch(/<label for="cq-market-photos"[^>]*>/);
    expect(html).toMatch(/<input[^>]*type="file"[^>]*accept="image\/\*"[^>]*multiple=""/);
    expect(html).toContain("Add photos");
    expect(html).toContain("Choose from your device");
    expect(html).not.toContain(MARKETPLACE_PHOTO_REQUIRED_MESSAGE);
  });

  it("marks the first thumbnail as the cover and labels remove buttons", () => {
    const html = render({
      photos: [
        { id: "a", url: "blob:a" },
        { id: "b", url: "blob:b" },
      ],
    });
    expect(html.match(/>Cover</g)).toHaveLength(1);
    expect(html.indexOf(">Cover<")).toBeLessThan(html.indexOf('src="blob:b"'));
    expect(html).toContain('aria-label="Remove cover photo"');
    expect(html).toContain('aria-label="Remove photo 2"');
    expect(html).toContain(">Add<");
  });

  it("shows the required error inside the photo section and hides Add at the maximum", () => {
    const html = render({ error: MARKETPLACE_PHOTO_REQUIRED_MESSAGE });
    expect(html).toContain(`role="alert">${MARKETPLACE_PHOTO_REQUIRED_MESSAGE}`);
    expect(html).toContain('aria-invalid="true"');
    const full = render({ photos: Array.from({ length: MARKETPLACE_MAX_PHOTOS }, (_, i) => ({ id: `${i}`, url: `blob:${i}` })) });
    expect(full).not.toContain(">Add<");
    expect(full).toContain(`maximum of ${MARKETPLACE_MAX_PHOTOS} photos`);
  });
});

describe("MarketSellComposer wiring", () => {
  const source = readFileSync(join(process.cwd(), "components/market/MarketSellComposer.tsx"), "utf8");

  it("portals out of the transformed tab shell so the header cannot cover it", () => {
    expect(source).toContain("createPortal(sheet, document.body)");
  });

  it("places Photos after price and before category", () => {
    const price = source.indexOf('id="cq-market-price"');
    const photos = source.indexOf("<MarketPhotoPicker");
    const category = source.indexOf('htmlFor="cq-market-category"');
    expect(price).toBeGreaterThan(-1);
    expect(photos).toBeGreaterThan(price);
    expect(category).toBeGreaterThan(photos);
  });

  it("keeps the photo requirement and reuses the existing compression + upload path", () => {
    expect(source).toContain("draft.photos.length === 0");
    expect(source).toContain("prepareQuadImage(file)");
    expect(source).toContain("uploadMarketplaceImage(prepared.file");
  });
});
