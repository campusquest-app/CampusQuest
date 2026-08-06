"use client";

import { compressImageFile, ImageCompressionError } from "@/lib/client/imageCompression";
import { formatUploadStageError, logQuadUpload, logQuadUploadError } from "@/lib/client/quadUploadLog";
import {
  QUAD_IMAGE_MAX_BYTES,
  QUAD_IMAGE_UPLOAD_TARGET_BYTES,
  extensionForImageMime,
  guessImageMimeFromName,
  isHeicLikeFile,
  isUploadableImageMime,
  looksLikeImageFile,
  normalizeImageMime,
} from "@/lib/quadMedia";

export type PreparedQuadImage = {
  file: File;
  mime: string;
  width: number | null;
  height: number | null;
  compressed: boolean;
  originalBytes: number;
  uploadBytes: number;
};

function sanitizeUploadFileName(name: string, mime: string): string {
  const ext = extensionForImageMime(mime);
  const base = (name || "photo")
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  return `${base || "photo"}.${ext}`;
}

/**
 * Prepare a gallery/camera image for `/api/quad/posts/media`.
 * Compresses when possible; on compression/thumbnail/resize failure, falls back
 * to the original file (except unconverted HEIC).
 */
export async function prepareQuadImage(file: File): Promise<PreparedQuadImage> {
  logQuadUpload("image_selection", {
    name: file.name,
    type: file.type,
    size: file.size,
    lastModified: file.lastModified,
  });

  if (!file || file.size <= 0) {
    const err = new Error("Selected image is empty.");
    logQuadUploadError("file_meta", err);
    throw err;
  }

  if (!looksLikeImageFile(file)) {
    const err = new Error("This image format is not supported. Use JPG, PNG, WebP, or HEIC.");
    logQuadUploadError("mime_detect", err, { name: file.name, type: file.type });
    throw err;
  }

  const detectedMime = normalizeImageMime(file.type) || guessImageMimeFromName(file.name);
  logQuadUpload("mime_detect", { detectedMime, heic: isHeicLikeFile(file) });
  logQuadUpload("file_meta", {
    filename: file.name,
    size: file.size,
    mime: detectedMime,
  });

  try {
    logQuadUpload("compression", { maxEdge: 1600, targetMaxBytes: QUAD_IMAGE_UPLOAD_TARGET_BYTES });
    const compressed = await compressImageFile(file, {
      maxEdge: 1600,
      quality: 0.84,
      targetMaxBytes: QUAD_IMAGE_UPLOAD_TARGET_BYTES,
    });
    logQuadUpload("dimensions", { width: compressed.width, height: compressed.height });
    logQuadUpload("resizing", {
      outType: compressed.type,
      outBytes: compressed.blob.size,
    });

    if (compressed.blob.size <= 0) {
      throw new Error("Compressed image was empty.");
    }
    if (compressed.blob.size > QUAD_IMAGE_MAX_BYTES) {
      throw new Error("This image is still too large after compression. Try a smaller photo.");
    }

    const safeName = sanitizeUploadFileName(compressed.fileName || file.name, compressed.type);
    const prepared = new File([compressed.blob], safeName, {
      type: compressed.type,
      lastModified: Date.now(),
    });
    logQuadUpload("prepare_complete", {
      compressed: true,
      originalBytes: file.size,
      uploadBytes: prepared.size,
      mime: prepared.type,
      filename: prepared.name,
    });
    return {
      file: prepared,
      mime: prepared.type,
      width: compressed.width,
      height: compressed.height,
      compressed: true,
      originalBytes: file.size,
      uploadBytes: prepared.size,
    };
  } catch (error) {
    logQuadUploadError("compression", error, {
      name: file.name,
      mime: detectedMime,
      size: file.size,
    });

    // HEIC must convert client-side — uploading original HEIC will fail on the server.
    if (isHeicLikeFile(file) && !isUploadableImageMime(detectedMime)) {
      const heicError =
        error instanceof ImageCompressionError
          ? error
          : new Error(
              "This HEIC photo can’t be converted on this device. Export it as JPG in Photos, then try again.",
            );
      throw heicError;
    }

    logQuadUpload("compression_fallback", {
      reason: error instanceof Error ? error.message : String(error),
      originalBytes: file.size,
    });

    if (file.size > QUAD_IMAGE_MAX_BYTES) {
      throw new Error(
        `This image is too large (${Math.round(file.size / (1024 * 1024))}MB). Please choose a smaller photo.`,
      );
    }

    const mime = isUploadableImageMime(detectedMime) ? detectedMime : "image/jpeg";
    const safeName = sanitizeUploadFileName(file.name, mime);
    const fallback = new File([file], safeName, {
      type: mime,
      lastModified: file.lastModified,
    });

    if (fallback.size <= 0) {
      throw new Error(formatUploadStageError("compression", error));
    }

    logQuadUpload("prepare_complete", {
      compressed: false,
      originalBytes: file.size,
      uploadBytes: fallback.size,
      mime: fallback.type,
      filename: fallback.name,
    });

    return {
      file: fallback,
      mime: fallback.type || mime,
      width: null,
      height: null,
      compressed: false,
      originalBytes: file.size,
      uploadBytes: fallback.size,
    };
  }
}
