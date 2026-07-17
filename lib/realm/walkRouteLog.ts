const IS_DEV = process.env.NODE_ENV !== "production";

/** Dev-only stage logging for the Walk-to → route → map flow. */
export function logWalkRoute(stage: string, detail?: Record<string, unknown>): void {
  if (!IS_DEV && process.env.NEXT_PUBLIC_DEBUG_EVENT_PINS !== "true") return;
  if (detail) console.info(`[cq:walk-route] ${stage}`, detail);
  else console.info(`[cq:walk-route] ${stage}`);
}
