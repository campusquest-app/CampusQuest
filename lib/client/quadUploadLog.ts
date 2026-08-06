"use client";

/**
 * Explicit stage logging for the Quad media upload pipeline.
 * Always prints failures with stacks; verbose stage logs in development.
 */

const PREFIX = "[cq][quad-media]";

export type QuadUploadStage =
  | "image_selection"
  | "mime_detect"
  | "file_meta"
  | "dimensions"
  | "compression"
  | "compression_fallback"
  | "resizing"
  | "thumbnail"
  | "cover"
  | "upload_start"
  | "upload_progress"
  | "upload_retry"
  | "supabase_response"
  | "database_insert"
  | "post_creation"
  | "prepare_complete"
  | "upload_complete"
  | "item_failed";

function isDev(): boolean {
  return process.env.NODE_ENV !== "production";
}

export function logQuadUpload(stage: QuadUploadStage, detail: Record<string, unknown> = {}): void {
  if (!isDev() && stage === "upload_progress") return;
  console.info(`${PREFIX} ${stage}`, detail);
}

export function logQuadUploadError(
  stage: QuadUploadStage,
  error: unknown,
  detail: Record<string, unknown> = {},
): void {
  const err = error instanceof Error ? error : new Error(String(error));
  console.error(`${PREFIX} FAIL @ ${stage}`, {
    ...detail,
    name: err.name,
    message: err.message,
    stack: err.stack,
  });
  if (err.stack) {
    console.error(err.stack);
  }
}

export function formatUploadStageError(stage: QuadUploadStage, error: unknown): string {
  const message =
    error instanceof Error && error.message.trim()
      ? error.message.trim()
      : "Unexpected upload error.";
  return `[${stage}] ${message}`;
}
