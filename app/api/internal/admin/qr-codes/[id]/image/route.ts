import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import QRCode from "qrcode";
import { requireQrAdminUser } from "@/lib/server/adminAuth";
import { ApiError, fail } from "@/lib/server/http";
import { buildCampusQuestScanUrl } from "@/lib/server/qrCodeAdmin";
import { createAdminClient } from "@/lib/server/supabase";
import { enforceRateLimit } from "@/lib/server/security";
import { gymQrDownloadFilename, isGymQrDatabaseCode } from "@/lib/gymQr";

const OFFICIAL_GYM_QR_FILE = resolve(process.cwd(), "public/assets/gym_qr.png");

type RouteContext = { params: { id: string } };

export async function GET(request: Request, context: RouteContext) {
  try {
    const auth = await requireQrAdminUser(request);
    enforceRateLimit({ userId: auth.user.id, routeKey: "admin:qr-codes:image", limit: 60, windowMs: 60_000 });

    const admin = createAdminClient();
    const { data, error } = await admin.from("qr_codes").select("code, title").eq("id", context.params.id).maybeSingle();
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

    const scanUrl = buildCampusQuestScanUrl(code, new URL(request.url).origin);
    const png = await QRCode.toBuffer(scanUrl, {
      type: "png",
      width: 512,
      margin: 2,
      color: { dark: "#0c4a6e", light: "#f0f9ff" },
    });

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
