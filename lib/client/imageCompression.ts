"use client";

/**
 * Client-side image compression for uploads.
 *
 * Resizes to a max longest-edge, re-encodes as WebP (or JPEG fallback) at ~85%
 * quality, and strips EXIF/orientation metadata (canvas re-encode discards it).
 * Decoding uses createImageBitmap so the heavy work stays off the main thread
 * where supported, and OffscreenCanvas is used for encoding when available.
 */

const ACCEPTED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const ACCEPTED_EXT = /\.(jpe?g|png|webp)$/i;
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
  const type = (file.type || "").toLowerCase();
  if (type) return ACCEPTED_TYPES.includes(type);
  // Some platforms omit the MIME type; fall back to the file extension.
  return ACCEPTED_EXT.test(file.name);
}

let cachedWebpSupport: boolean | null = null;
function supportsWebpEncode(): boolean {
  if (cachedWebpSupport !== null) return cachedWebpSupport;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    cachedWebpSupport = canvas.toDataURL("image/webp").startsWith("data:image/webp");
  } catch {
    cachedWebpSupport = false;
  }
  return cachedWebpSupport;
}

async function decodeImage(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
    } catch {
      // Fall through to <img> decode (e.g. Safari without the orientation option).
    }
  }
  return await decodeWithImageElement(file);
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
      reject(new ImageCompressionError("That image appears to be corrupted."));
    };
    img.src = url;
  });
}

function fitWithin(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

async function encodeCanvas(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  type: string,
  quality: number,
): Promise<Blob> {
  if (typeof OffscreenCanvas !== "undefined" && canvas instanceof OffscreenCanvas) {
    return await canvas.convertToBlob({ type, quality });
  }
  return await new Promise<Blob>((resolve, reject) => {
    (canvas as HTMLCanvasElement).toBlob(
      (blob) => (blob ? resolve(blob) : reject(new ImageCompressionError("Image encoding failed."))),
      type,
      quality,
    );
  });
}

/** Compress + resize an image File. Always succeeds for valid raster images of any size. */
export async function compressImageFile(
  file: File,
  options?: { maxEdge?: number; quality?: number },
): Promise<CompressedImage> {
  if (!isAcceptedImageType(file)) {
    throw new ImageCompressionError("Unsupported format. Please use JPG, PNG, or WebP.");
  }

  const maxEdge = options?.maxEdge ?? DEFAULT_MAX_EDGE;
  const quality = options?.quality ?? DEFAULT_QUALITY;

  const source = await decodeImage(file);
  const srcWidth = "width" in source ? source.width : 0;
  const srcHeight = "height" in source ? source.height : 0;

  if (!srcWidth || !srcHeight) {
    if ("close" in source) source.close();
    throw new ImageCompressionError("That image appears to be corrupted.");
  }

  const { width, height } = fitWithin(srcWidth, srcHeight, maxEdge);

  let canvas: HTMLCanvasElement | OffscreenCanvas;
  if (typeof OffscreenCanvas !== "undefined") {
    canvas = new OffscreenCanvas(width, height);
  } else {
    canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
  }

  const ctx = canvas.getContext("2d") as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;
  if (!ctx) {
    if ("close" in source) source.close();
    throw new ImageCompressionError("Image processing is not supported on this device.");
  }

  ctx.drawImage(source as CanvasImageSource, 0, 0, width, height);
  // Release the full-resolution decode promptly to keep memory low.
  if ("close" in source) source.close();

  const outType: "image/webp" | "image/jpeg" = supportsWebpEncode() ? "image/webp" : "image/jpeg";
  const blob = await encodeCanvas(canvas, outType, quality);

  if (!blob || blob.size === 0) {
    throw new ImageCompressionError("Image encoding failed.");
  }

  const baseName = file.name.replace(/\.[^.]+$/, "").trim() || "memory";
  const ext = outType === "image/webp" ? "webp" : "jpg";

  return { blob, type: outType, width, height, fileName: `${baseName}.${ext}` };
}
