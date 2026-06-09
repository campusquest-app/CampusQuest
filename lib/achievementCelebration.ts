import type { AchievementDef } from "./achievementsCatalog";

type CelebrationListener = (def: AchievementDef) => void;

const queue: AchievementDef[] = [];
const listeners = new Set<CelebrationListener>();

export function queueAchievementCelebration(def: AchievementDef): void {
  if (typeof window === "undefined") return;
  queue.push(def);
  const next = queue[0];
  if (next) listeners.forEach((fn) => fn(next));
}

export function subscribeAchievementCelebrations(listener: CelebrationListener): () => void {
  listeners.add(listener);
  if (queue[0]) listener(queue[0]);
  return () => listeners.delete(listener);
}

export function dismissAchievementCelebration(): AchievementDef | undefined {
  queue.shift();
  const next = queue[0];
  if (next) listeners.forEach((fn) => fn(next));
  return next;
}

export function hasPendingCelebrations(): boolean {
  return queue.length > 0;
}
