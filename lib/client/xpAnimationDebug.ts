const IS_DEV = process.env.NODE_ENV !== "production";

export function logXpAnimation(stage: string, payload?: Record<string, unknown>): void {
  if (!IS_DEV) return;
  console.info(`[cq][xp-animation] ${stage}`, payload ?? {});
}

export function logXpMobile(stage: string, payload?: Record<string, unknown>): void {
  if (!IS_DEV) return;
  console.info(`[cq][xp-mobile] ${stage}`, payload ?? {});
}

export function logXpAudio(stage: string, payload?: Record<string, unknown>): void {
  if (!IS_DEV) return;
  console.info(`[cq][xp-audio] ${stage}`, payload ?? {});
}

export function logRewardFlow(stage: string, payload?: Record<string, unknown>): void {
  if (!IS_DEV) return;
  console.info(`[cq][reward-flow] ${stage}`, payload ?? {});
}

export function logScanner(stage: string, payload?: Record<string, unknown>): void {
  if (!IS_DEV) return;
  console.info(`[cq][scanner] ${stage}`, payload ?? {});
}
