const IS_DEV = process.env.NODE_ENV !== "production";

export function logQrScanServer(stage: string, payload: Record<string, unknown>): void {
  if (!IS_DEV) return;
  console.info(`[cq][qr-scan] ${stage}`, payload);
}
