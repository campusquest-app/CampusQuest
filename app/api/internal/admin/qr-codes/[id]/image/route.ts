import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { requireQrAdminUser } from "@/lib/server/adminAuth";
import { ApiError, fail, ok } from "@/lib/server/http";
import { buildCampusQuestScanUrl } from "@/lib/server/qrCodeAdmin";
import {
  generateQrPngBuffer,
  persistCustomQrImageUrl,
  uploadQrCodeCustomImage,
} from "@/lib/server/qrCodeImages";
import { createAdminClient } from "@/lib/server/supabase";
import { enforceRateLimit } from "@/lib/server/security";
import { gymQrDownloadFilename, isGymQrDatabaseCode } from "@/lib/gymQr";

const OFFICIAL_GYM_QR_FILE = resolve(process.cwd(), "public/assets/gym_qr.png");

type RouteContext = { params: { id: string } };

async function fetchStoredImage(url: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const auth = await requireQrAdminUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "admin:qr-codes:image", limit: 60, windowMs: 60_000 });

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("qr_codes")
      .select("code, title, image_url, qr_png_url")
      .eq("id", context.params.id)
      .maybeSingle();
    if (error) throw new ApiError(400, error.message, "QR_CODE_LOOKUP_FAILED");
    if (!data?.code) throw new ApiError(404, "QR code not found.", "QR_CODE_NOT_FOUND");

    const code = data.code as string;
    if (code === "GYM" || isGymQrDatabaseCode(code)) {
      const png = readFileSync(OFFICIAL_GYM_QR_FILE);
      return new Response(png, {
        status: 200,
        headers: {
          "content-type": "image/png",
          "cache-control": "public, max-age=3600",
          "content-disposition": `inline; filename="${gymQrDownloadFilename()}"`,
        },
      });
    }

    const customUrl = (data.image_url as string | null) ?? (data.qr_png_url as string | null);
    if (customUrl) {
      const stored = await fetchStoredImage(customUrl);
      if (stored) {
        const contentType = customUrl.endsWith(".svg") ? "image/svg+xml" : "image/png";
        return new Response(Buffer.from(stored), {
          status: 200,
          headers: {
            "content-type": contentType,
            "cache-control": "private, max-age=300",
            "content-disposition": `inline; filename="campusquest-qr-${code}.png"`,
          },
        });
      }
    }

    const scanUrl = buildCampusQuestScanUrl(code, new URL(request.url).origin);
    const png = await generateQrPngBuffer(scanUrl);

    return new Response(new Uint8Array(png), {
      status: 200,
      headers: {
        "content-type": "image/png",
        "cache-control": "private, max-age=300",
        "content-disposition": `inline; filename="campusquest-qr-${code}.png"`,
      },
    });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const auth = await requireQrAdminUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "admin:qr-codes:image-upload", limit: 30, windowMs: 60_000 });

    const admin = createAdminClient();
    const { data: row, error } = await admin.from("qr_codes").select("id").eq("id", context.params.id).maybeSingle();
    if (error) throw new ApiError(400, error.message, "QR_CODE_LOOKUP_FAILED");
    if (!row) throw new ApiError(404, "QR code not found.", "QR_CODE_NOT_FOUND");

    const form = await request.formData();
    const file = form.get("image");
    if (!(file instanceof File)) {
      throw new ApiError(400, "Missing image file.", "QR_IMAGE_MISSING");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const imageUrl = await uploadQrCodeCustomImage({
      qrId: context.params.id,
      buffer,
      mime: file.type || "image/png",
      originalFilename: file.name,
    });
    await persistCustomQrImageUrl(context.params.id, imageUrl);

    return ok({ imageUrl });
  } catch (error) {
    return fail(error);
  }
}
