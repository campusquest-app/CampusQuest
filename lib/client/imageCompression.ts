"use client";

/**
 * Client-side image compression for uploads.
 *
 * Mobile-safe path:
 * 1. Decode with HTMLImageElement (widest Safari/PWA/Android support)
 * 2. Optionally try createImageBitmap if <img> fails
 * 3. Draw to a standard <canvas> (avoid OffscreenCanvas on mobile)
 * 4. Encode via canvas.toBlob as JPEG (or WebP when clearly supported)
 */

const ACCEPTED_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
];
const ACCEPTED_EXT = /\.(jpe?g|png|webp|gif|heic|heif)$/i;
const DEFAULT_MAX_EDGE = 1080;
const DEFAULT_QUALITY = 0.85;

export class ImageCompressionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageCompressionError";
  }
}

export type CompressedImage = {
  blob: Blob;
  type: "image/webp" | "image/jpeg";
  width: number;
  height: number;
  fileName: string;
};

export function isAcceptedImageType(file: File): boolean {
  const type = (file.type || "").toLowerCase().replace("image/jpg", "image/jpeg");
  if (type) return ACCEPTED_TYPES.includes(type);
  return ACCEPTED_EXT.test(file.name);
}

function isHeicLike(file: File): boolean {
  return /\.(heic|heif)$/i.test(file.name) || /image\/hei[cf]/i.test(file.type);
}

let cachedWebpSupport: boolean | null = null;
function supportsWebpEncode(): boolean {
  if (cachedWebpSupport !== null) return cachedWebpSupport;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    cachedWebpSupport = canvas.toDataURL("image/webp").startsWith("data:image/webp");
  } catch (error) {
    console.warn("[cq][image-compression] webp probe failed", error);
    cachedWebpSupport = false;
  }
  return cachedWebpSupport;
}

function decodeWithImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(
        new ImageCompressionError(
          isHeicLike(file)
            ? "This HEIC photo can’t be decoded on this device. Export it as JPG in Photos, then try again."
            : "That image appears to be corrupted.",
        ),
      );
    };
    img.src = url;
  });
}

async function decodeWithImageBitmap(file: File): Promise<ImageBitmap> {
  if (typeof createImageBitmap !== "function") {
    throw new ImageCompressionError("createImageBitmap is not available.");
  }
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
  } catch (orientedError) {
    console.warn("[cq][image-compression] createImageBitmap(orientation) failed", orientedError);
    return await createImageBitmap(file);
  }
}

/** Prefer HTMLImageElement; fall back to createImageBitmap only if needed. */
async function decodeImage(file: File): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await decodeWithImageElement(file);
  } catch (imgError) {
    console.warn("[cq][image-compression] HTMLImageElement decode failed; trying createImageBitmap", {
      name: file.name,
      type: file.type,
      message: imgError instanceof Error ? imgError.message : String(imgError),
    });
    try {
      return await decodeWithImageBitmap(file);
    } catch (bitmapError) {
      console.error("[cq][image-compression] all decode paths failed", bitmapError);
      if (isHeicLike(file)) {
        throw new ImageCompressionError(
          "This HEIC photo can’t be converted on this device. Export it as JPG in Photos, then try again.",
        );
      }
      throw imgError instanceof ImageCompressionError
        ? imgError
        : new ImageCompressionError(
            bitmapError instanceof Error ? bitmapError.message : "That image could not be decoded.",
          );
    }
  }
}

function fitWithin(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

function encodeHtmlCanvas(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new ImageCompressionError("Image encoding failed."))),
      type,
      quality,
    );
  });
}

function sanitizeBaseName(name: string): string {
  const base = name.replace(/\.[^.]+$/, "").trim() || "photo";
  return base.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80) || "photo";
}

/** Compress + resize an image File using mobile-safe canvas APIs. */
export async function compressImageFile(
  file: File,
  options?: {
    maxEdge?: number;
    quality?: number;
    /** If set, re-encode at lower quality until under this size (best effort). */
    targetMaxBytes?: number;
  },
): Promise<CompressedImage> {
  if (!isAcceptedImageType(file)) {
    throw new ImageCompressionError("Unsupported format. Please use JPG, PNG, WebP, or HEIC.");
  }

  const maxEdge = options?.maxEdge ?? DEFAULT_MAX_EDGE;
  let quality = options?.quality ?? DEFAULT_QUALITY;
  const targetMaxBytes = options?.targetMaxBytes;

  console.info("[cq][image-compression] start", {
    name: file.name,
    type: file.type,
    size: file.size,
    maxEdge,
    targetMaxBytes: targetMaxBytes ?? null,
  });

  const source = await decodeImage(file);
  const srcWidth = "width" in source ? source.width : 0;
  const srcHeight = "height" in source ? source.height : 0;

  if (!srcWidth || !srcHeight) {
    if ("close" in source) source.close();
    throw new ImageCompressionError("That image appears to be corrupted.");
  }

  const { width, height } = fitWithin(srcWidth, srcHeight, maxEdge);

  // Always use HTMLCanvasElement — OffscreenCanvas is unreliable in some iOS PWAs.
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    if ("close" in source) source.close();
    throw new ImageCompressionError("Image processing is not supported on this device.");
  }

  try {
    ctx.drawImage(source as CanvasImageSource, 0, 0, width, height);
  } catch (drawError) {
    if ("close" in source) source.close();
    throw new ImageCompressionError(
      drawError instanceof Error ? drawError.message : "Could not draw image to canvas.",
    );
  }
  if ("close" in source) source.close();

  const prefersWebp =
    supportsWebpEncode() &&
    (file.type === "image/webp" || file.type === "image/png" || /\.(webp|png)$/i.test(file.name));
  const outType: "image/webp" | "image/jpeg" = prefersWebp ? "image/webp" : "image/jpeg";

  let blob = await encodeHtmlCanvas(canvas, outType, quality);
  if (targetMaxBytes && blob.size > targetMaxBytes) {
    for (const q of [0.75, 0.65, 0.55, 0.45]) {
      quality = q;
      blob = await encodeHtmlCanvas(canvas, "image/jpeg", quality);
      if (blob.size <= targetMaxBytes) break;
    }
  }

  if (!blob || blob.size === 0) {
    throw new ImageCompressionError("Image encoding failed.");
  }

  const finalType = blob.type === "image/webp" ? "image/webp" : "image/jpeg";
  const ext = finalType === "image/webp" ? "webp" : "jpg";
  const fileName = `${sanitizeBaseName(file.name)}.${ext}`;

  console.info("[cq][image-compression] complete", {
    width,
    height,
    outType: finalType,
    outBytes: blob.size,
    fileName,
  });

  return { blob, type: finalType, width, height, fileName };
}
