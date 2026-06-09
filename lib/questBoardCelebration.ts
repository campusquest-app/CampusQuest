import type { QuestCelebrationPayload } from "./questBoardActions";

type QuestCelebrationListener = (payload: QuestCelebrationPayload) => void;

const queue: QuestCelebrationPayload[] = [];
const listeners = new Set<QuestCelebrationListener>();

export function queueQuestCelebration(payload: QuestCelebrationPayload): void {
  if (typeof window === "undefined") return;
  queue.push(payload);
  const next = queue[0];
  if (next) listeners.forEach((fn) => fn(next));
}

export function subscribeQuestCelebrations(listener: QuestCelebrationListener): () => void {
  listeners.add(listener);
  if (queue[0]) listener(queue[0]);
  return () => listeners.delete(listener);
}

export function dismissQuestCelebration(): QuestCelebrationPayload | undefined {
  queue.shift();
  const next = queue[0];
  if (next) listeners.forEach((fn) => fn(next));
  return next;
}
