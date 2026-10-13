import { MARKETPLACE_MAX_PHOTOS } from "@/lib/marketplace/policy";
import { QUAD_IMAGE_MAX_BYTES, looksLikeImageFile } from "@/lib/quadMedia";

/** Same ceiling the marketplace media route enforces. */
export const MARKETPLACE_PHOTO_MAX_BYTES = QUAD_IMAGE_MAX_BYTES;

export const MARKETPLACE_PHOTO_REQUIRED_MESSAGE = "Add at least one photo.";

type SelectableFile = { name: string; type: string; size: number };

export type MarketplacePhotoSelection<T extends SelectableFile> = {
  accepted: T[];
  notImages: string[];
  tooLarge: string[];
  overLimit: number;
};

/**
 * Filters a picker selection: images only, within the upload size ceiling, and
 * no more than the listing's remaining photo slots (selection order preserved).
 */
export function selectMarketplacePhotos<T extends SelectableFile>(
  currentCount: number,
  files: readonly T[],
  max: number = MARKETPLACE_MAX_PHOTOS,
): MarketplacePhotoSelection<T> {
  const result: MarketplacePhotoSelection<T> = { accepted: [], notImages: [], tooLarge: [], overLimit: 0 };
  let slots = Math.max(0, max - currentCount);
  for (const file of files) {
    if (!looksLikeImageFile(file)) {
      result.notImages.push(file.name || "file");
      continue;
    }
    if (file.size <= 0 || file.size > MARKETPLACE_PHOTO_MAX_BYTES) {
      result.tooLarge.push(file.name || "photo");
      continue;
    }
    if (slots <= 0) {
      result.overLimit += 1;
      continue;
    }
    result.accepted.push(file);
    slots -= 1;
  }
  return result;
}

export type ListingPhotoSource<F> = { kind: "existing"; url: string } | { kind: "file"; file: F };

/**
 * Resolves listing photos to URLs in display order (cover first). Already-saved
 * photos keep their URL; new files are uploaded one at a time, only at publish.
 */
export async function resolveListingPhotoUrls<F>(
  photos: readonly ListingPhotoSource<F>[],
  deps: { upload: (file: F) => Promise<string>; onProgress?: (current: number, total: number) => void },
): Promise<string[]> {
  const total = photos.filter((photo) => photo.kind === "file").length;
  const urls: string[] = [];
  let current = 0;
  for (const photo of photos) {
    if (photo.kind === "existing") {
      urls.push(photo.url);
      continue;
    }
    current += 1;
    deps.onProgress?.(current, total);
    urls.push(await deps.upload(photo.file));
  }
  return urls;
}

export function marketplacePhotoSelectionNotice(
  selection: MarketplacePhotoSelection<SelectableFile>,
  max: number = MARKETPLACE_MAX_PHOTOS,
): string | null {
  const parts: string[] = [];
  if (selection.notImages.length > 0) {
    parts.push(
      selection.notImages.length === 1
        ? `${selection.notImages[0]} isn't an image, so it wasn't added.`
        : `${selection.notImages.length} files weren't images, so they weren't added.`,
    );
  }
  if (selection.tooLarge.length > 0) {
    const limitMb = Math.round(MARKETPLACE_PHOTO_MAX_BYTES / (1024 * 1024));
    parts.push(
      selection.tooLarge.length === 1
        ? `${selection.tooLarge[0]} is larger than ${limitMb}MB.`
        : `${selection.tooLarge.length} photos are larger than ${limitMb}MB.`,
    );
  }
  if (selection.overLimit > 0) {
    parts.push(`You can add up to ${max} photos. ${selection.overLimit === 1 ? "1 photo was" : `${selection.overLimit} photos were`} left out.`);
  }
  return parts.length > 0 ? parts.join(" ") : null;
}
