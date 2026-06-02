import { normalizeQrScanInput } from "@/lib/client/normalizeQrScanInput";
import { isLegacyCampusQuestActivityJson } from "@/lib/qrCodeExtract";
import { parseCampusQuestQrPayload } from "@/lib/qrCampusQuestActivity";
import type { QrDetectedFormat } from "@/lib/client/qrScanUserMessages";

export type QrScanClassification =
  | { kind: "empty" }
  | { kind: "secure"; code: string; format: "secure_code" | "legacy_activity_json" | "url_query" | "custom_scheme" | "plain_code" }
  | {
      kind: "legacy";
      format: "legacy_activity_json";
      payload: import("@/lib/qrCampusQuestActivity").CampusQuestQrActivityPayloadParsed;
    }
  | {
      kind: "legacy_parse_error";
      format: "legacy_activity_json";
      code: import("@/lib/qrCampusQuestActivity").ParseQrActivityErrorCode;
      message: string;
    }
  | { kind: "unrecognized"; format: "unrecognized" };

export function classifyQrScanText(rawText: string): QrScanClassification {
  const trimmed = rawText.trim();
  if (!trimmed) return { kind: "empty" };

  const normalized = normalizeQrScanInput(trimmed);
  if (normalized) {
    return {
      kind: "secure",
      code: normalized.code,
      format: normalized.format === "legacy_activity_json" ? "legacy_activity_json" : "secure_code",
    };
  }

  if (isLegacyCampusQuestActivityJson(trimmed)) {
    const parsed = parseCampusQuestQrPayload(trimmed);
    if (!parsed.ok) {
      return {
        kind: "legacy_parse_error",
        format: "legacy_activity_json",
        code: parsed.code,
        message: parsed.message,
      };
    }
    return { kind: "legacy", format: "legacy_activity_json", payload: parsed.payload };
  }

  return { kind: "unrecognized", format: "unrecognized" };
}

export function detectedFormatLabel(format: QrDetectedFormat): string {
  return format;
}
