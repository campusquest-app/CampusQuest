const IS_DEV = process.env.NODE_ENV !== "production";

export function logMobileXp(stage: string, payload?: Record<string, unknown>): void {
  if (!IS_DEV) return;
  console.info(`[cq][mobile-xp] ${stage}`, payload ?? {});
}

export function logMobileAudio(stage: string, payload?: Record<string, unknown>): void {
  if (!IS_DEV) return;
  console.info(`[cq][mobile-audio] ${stage}`, payload ?? {});
}
