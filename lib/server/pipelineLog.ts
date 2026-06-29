/**
 * Structured per-stage logging for multi-step server pipelines
 * (e.g. the Campus Memory upload → storage → DB insert flow).
 *
 * Failures are always logged with status / Supabase (or PG) error code /
 * message so production issues can be triaged. Step starts and successes are
 * logged only in development to keep production logs quiet. Stack traces are
 * included in development only.
 */

const IS_DEV = process.env.NODE_ENV !== "production";

export type PipelineStepDetail = Record<string, unknown>;

/** Pull a usable error code off ApiError / Supabase StorageError / PostgrestError. */
export function readErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const candidate = error as { code?: unknown; statusCode?: unknown; name?: unknown };
  if (typeof candidate.code === "string" && candidate.code) return candidate.code;
  if (typeof candidate.statusCode === "string" && candidate.statusCode) return candidate.statusCode;
  if (typeof candidate.statusCode === "number") return String(candidate.statusCode);
  return undefined;
}

export function readErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return String(error);
}

/** Log a successful (or in-progress) pipeline step. Dev-only to avoid log noise. */
export function logPipelineStep(
  pipeline: string,
  step: string,
  detail?: PipelineStepDetail,
): void {
  if (!IS_DEV) return;
  console.info(`[cq][${pipeline}] ${step} ✓`, { pipeline, step, ok: true, ...(detail ?? {}) });
}

/** Log a failed pipeline step. Always logged (prod + dev); stack only in dev. */
export function logPipelineFailure(args: {
  pipeline: string;
  step: string;
  status?: number;
  code?: string;
  error?: unknown;
  detail?: PipelineStepDetail;
}): void {
  const code = args.code ?? readErrorCode(args.error);
  const message = args.error !== undefined ? readErrorMessage(args.error) : undefined;
  const stack = IS_DEV && args.error instanceof Error ? args.error.stack : undefined;

  console.error(`[cq][${args.pipeline}] ${args.step} ✗`, {
    pipeline: args.pipeline,
    step: args.step,
    ok: false,
    ...(args.status !== undefined ? { status: args.status } : {}),
    ...(code ? { code } : {}),
    ...(message ? { message } : {}),
    ...(args.detail ?? {}),
    ...(stack ? { stack } : {}),
  });
}
