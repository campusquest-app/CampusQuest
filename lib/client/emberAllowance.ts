"use client";

import {
  EMBER_COPY,
  EMBER_EXPLAINER_STORAGE_KEY,
  remainingEmbersCopy,
  type EmberAllowance,
} from "@/lib/embers";
import { fetchAuthed } from "@/lib/client/dashboardApi";

export { EMBER_COPY, remainingEmbersCopy };

type Listener = () => void;

let allowance: EmberAllowance | null = null;
const listeners = new Set<Listener>();

function emit() {
  Array.from(listeners).forEach((listener) => listener());
}

export function getEmberAllowance(): EmberAllowance | null {
  return allowance;
}

export function setEmberAllowance(next: EmberAllowance | null): void {
  allowance = next;
  emit();
}

export function subscribeEmberAllowance(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function snapshotEmberAllowance(): EmberAllowance | null {
  return allowance ? { ...allowance } : null;
}

export function applyOptimisticEmberGive(): void {
  if (!allowance || allowance.unlimited) return;
  setEmberAllowance({
    ...allowance,
    used: allowance.used + 1,
    remaining: Math.max(0, allowance.remaining - 1),
  });
}

export async function fetchEmberAllowance(): Promise<EmberAllowance> {
  const data = await fetchAuthed<EmberAllowance>("/api/quad/embers");
  setEmberAllowance(data);
  return data;
}

export function hasSeenEmberExplainer(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(EMBER_EXPLAINER_STORAGE_KEY) === "1";
  } catch {
    return true;
  }
}

export function markEmberExplainerSeen(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(EMBER_EXPLAINER_STORAGE_KEY, "1");
  } catch {
    /* private mode */
  }
}

export function emberActionLabel(args: {
  active: boolean;
  count: number;
  remaining: number | null;
  isOwnPost: boolean;
  unlimited?: boolean;
}): string {
  if (args.isOwnPost) {
    const received = args.count > 0 ? (args.count === 1 ? EMBER_COPY.receivedOne : `${args.count} Embers received`) : "";
    return received || EMBER_COPY.ownPost;
  }
  if (args.active) return EMBER_COPY.remove;
  if (args.unlimited) return EMBER_COPY.give;
  if (args.remaining === 0) return `${EMBER_COPY.give}. ${EMBER_COPY.exhausted}`;
  if (args.remaining != null) return `${EMBER_COPY.give}. ${remainingEmbersCopy(args.remaining)}`;
  return EMBER_COPY.give;
}
