import {
  extractCampusQuestQrCode,
  isCampusQuestQrCode,
  isLegacyCampusQuestActivityJson,
  normalizeQrCode,
} from "@/lib/qrCodeExtract";
import type { QrDetectedFormat } from "@/lib/client/qrScanUserMessages";

export type NormalizedQrScan = {
  code: string;
  format: QrDetectedFormat | "url_query" | "custom_scheme" | "plain_code";
};

function codeFromActivityIdField(activityId: unknown): string | null {
  if (activityId == null) return null;
  const raw = String(activityId).trim();
  if (!raw) return null;
  return extractCampusQuestQrCode(raw) ?? (isCampusQuestQrCode(raw) ? normalizeQrCode(raw) : null);
}

/**
 * Normalize any supported scan/deep-link payload to a Supabase `qr_codes.code` value.
 */
export function normalizeQrScanInput(rawText: string): NormalizedQrScan | null {
  const trimmed = rawText.trim();
  if (!trimmed) return null;

  const direct = extractCampusQuestQrCode(trimmed);
  if (direct) {
    let format: NormalizedQrScan["format"] = "plain_code";
    if (/^campusquest:/i.test(trimmed)) format = "custom_scheme";
    else if (/^https?:\/\//i.test(trimmed)) format = "url_query";
    else if (trimmed.startsWith("{")) format = "legacy_activity_json";
    return { code: direct, format };
  }

  if (isLegacyCampusQuestActivityJson(trimmed)) {
    try {
      const parsed = JSON.parse(trimmed) as { activityId?: unknown };
      const code = codeFromActivityIdField(parsed.activityId);
      if (code) return { code, format: "legacy_activity_json" };
    } catch {
      /* fall through */
    }
  }

  return null;
}
