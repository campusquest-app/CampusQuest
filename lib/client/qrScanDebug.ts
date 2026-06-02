const IS_DEV = process.env.NODE_ENV !== "production";

export type QrScanDebugStage =
  | "raw_scan"
  | "format_detected"
  | "secure_extract"
  | "legacy_parse"
  | "validation_request"
  | "validation_response"
  | "validation_failed";

function preview(text: string, max = 120): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

/** Dev-only structured QR scan logs (never logs auth tokens). */
export function logQrScanDebug(
  stage: QrScanDebugStage,
  payload: Record<string, unknown>,
): void {
  if (!IS_DEV) return;
  console.info(`[cq][qr-scan] ${stage}`, payload);
}

export function logQrScanRawResult(rawText: string): void {
  logQrScanDebug("raw_scan", {
    rawLength: rawText.length,
    rawPreview: preview(rawText),
  });
}
