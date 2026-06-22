import type { AchievementDef } from "./achievementsCatalog";

export type AchievementCelebrationPayload = {
  def: AchievementDef;
  founderNumber?: number;
};

type CelebrationListener = (payload: AchievementCelebrationPayload) => void;

const queue: AchievementCelebrationPayload[] = [];
const listeners = new Set<CelebrationListener>();

export function queueAchievementCelebration(
  def: AchievementDef,
  options?: { founderNumber?: number },
): void {
  if (typeof window === "undefined") return;
  const payload: AchievementCelebrationPayload = {
    def,
    founderNumber: options?.founderNumber,
  };
  queue.push(payload);
  const next = queue[0];
  if (next) listeners.forEach((fn) => fn(next));
}

export function subscribeAchievementCelebrations(listener: CelebrationListener): () => void {
  listeners.add(listener);
  if (queue[0]) listener(queue[0]);
  return () => listeners.delete(listener);
}

export function dismissAchievementCelebration(): AchievementCelebrationPayload | undefined {
  queue.shift();
  const next = queue[0];
  if (next) listeners.forEach((fn) => fn(next));
  return next;
}

export function hasPendingCelebrations(): boolean {
  return queue.length > 0;
}
