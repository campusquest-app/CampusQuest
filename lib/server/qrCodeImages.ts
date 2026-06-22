import QRCode from "qrcode";
import { ApiError } from "@/lib/server/http";
import { buildCampusQuestScanUrl } from "@/lib/server/qrCodeAdmin";
import { createAdminClient } from "@/lib/server/supabase";

export const QR_CODE_IMAGES_BUCKET = "qr-code-images";
export const MAX_QR_IMAGE_BYTES = 2 * 1024 * 1024;

const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp", "image/svg+xml"]);

function extensionForMime(mime: string): string {
  switch (mime.toLowerCase()) {
    case "image/png":
      return "png";
    case "image/jpeg":
    case "image/jpg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/svg+xml":
      return "svg";
    default:
      return "bin";
  }
}

export function assertAllowedQrImageMime(mime: string): string {
  const normalized = mime.toLowerCase().replace("image/jpg", "image/jpeg");
  if (!ALLOWED_MIME.has(normalized) && !ALLOWED_MIME.has(mime.toLowerCase())) {
    throw new ApiError(400, "Unsupported image type. Use PNG, JPG, WEBP, or SVG.", "QR_IMAGE_INVALID_TYPE");
  }
  return normalized === "image/jpg" ? "image/jpeg" : normalized;
}

export function assertQrImageSize(byteLength: number): void {
  if (byteLength <= 0) {
    throw new ApiError(400, "Image file is empty.", "QR_IMAGE_EMPTY");
  }
  if (byteLength > MAX_QR_IMAGE_BYTES) {
    throw new ApiError(400, "Image is too large (max 2 MB).", "QR_IMAGE_TOO_LARGE");
  }
}

async function uploadBuffer(args: {
  qrId: string;
  buffer: Buffer;
  mime: string;
  folder: "uploads" | "generated";
  filename?: string;
}): Promise<string> {
  const admin = createAdminClient();
  const ext = extensionForMime(args.mime);
  const safeName = (args.filename ?? `${args.qrId}.${ext}`).replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `${args.folder}/${args.qrId}-${safeName}`;

  const { error: uploadError } = await admin.storage.from(QR_CODE_IMAGES_BUCKET).upload(storagePath, args.buffer, {
    contentType: args.mime,
    upsert: true,
  });

  if (uploadError) {
    const msg = uploadError.message ?? "QR image upload failed.";
    if (/bucket not found|does not exist/i.test(msg)) {
      throw new ApiError(503, "QR image storage is not configured.", "QR_IMAGE_BUCKET_MISSING");
    }
    throw new ApiError(400, msg, "QR_IMAGE_UPLOAD_FAILED");
  }

  const { data } = admin.storage.from(QR_CODE_IMAGES_BUCKET).getPublicUrl(storagePath);
  return data.publicUrl;
}

export async function uploadQrCodeCustomImage(args: {
  qrId: string;
  buffer: Buffer;
  mime: string;
  originalFilename?: string;
}): Promise<string> {
  assertQrImageSize(args.buffer.length);
  const mime = assertAllowedQrImageMime(args.mime);
  return uploadBuffer({
    qrId: args.qrId,
    buffer: args.buffer,
    mime,
    folder: "uploads",
    filename: args.originalFilename,
  });
}

export async function generateQrPngBuffer(scanUrl: string): Promise<Buffer> {
  return QRCode.toBuffer(scanUrl, {
    type: "png",
    width: 512,
    margin: 2,
    color: { dark: "#0c4a6e", light: "#f0f9ff" },
  });
}

export async function regenerateAndStoreQrPng(args: {
  qrId: string;
  code: string;
  origin?: string;
}): Promise<{ qrPngUrl: string; scanUrl: string }> {
  const scanUrl = buildCampusQuestScanUrl(args.code, args.origin);
  const png = await generateQrPngBuffer(scanUrl);
  const qrPngUrl = await uploadBuffer({
    qrId: args.qrId,
    buffer: png,
    mime: "image/png",
    folder: "generated",
    filename: `${args.code}.png`,
  });

  const admin = createAdminClient();
  const metadataPatch = { scan_url: scanUrl };
  const { data: existing } = await admin.from("qr_codes").select("metadata").eq("id", args.qrId).maybeSingle();
  const mergedMetadata = {
    ...((existing?.metadata as Record<string, unknown> | null) ?? {}),
    ...metadataPatch,
  };

  const { error } = await admin
    .from("qr_codes")
    .update({ qr_png_url: qrPngUrl, metadata: mergedMetadata })
    .eq("id", args.qrId);
  if (error) throw new ApiError(400, error.message, "QR_PNG_PERSIST_FAILED");

  return { qrPngUrl, scanUrl };
}

export async function persistCustomQrImageUrl(qrId: string, imageUrl: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("qr_codes").update({ image_url: imageUrl }).eq("id", qrId);
  if (error) throw new ApiError(400, error.message, "QR_IMAGE_URL_UPDATE_FAILED");
}

export function resolveQrPreviewUrl(row: {
  id: string;
  image_url?: string | null;
  qr_png_url?: string | null;
}): string {
  if (row.image_url?.trim()) return row.image_url.trim();
  if (row.qr_png_url?.trim()) return row.qr_png_url.trim();
  return `/api/internal/admin/qr-codes/${row.id}/image`;
}
