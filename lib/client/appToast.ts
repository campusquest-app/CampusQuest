"use client";

export type AppToastTone = "success" | "error" | "info";

export type AppToast = {
  id: number;
  message: string;
  tone: AppToastTone;
  durationMs: number;
};

type Listener = () => void;

let seq = 0;
let current: AppToast | null = null;
let clearTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<Listener>();

function emit() {
  Array.from(listeners).forEach((listener) => listener());
}

export function getAppToast(): AppToast | null {
  return current;
}

export function subscribeAppToast(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function dismissAppToast(): void {
  if (clearTimer != null) {
    clearTimeout(clearTimer);
    clearTimer = null;
  }
  if (!current) return;
  current = null;
  emit();
}

export function showAppToast(
  message: string,
  options?: { tone?: AppToastTone; durationMs?: number },
): void {
  const trimmed = message.trim();
  if (!trimmed) return;
  if (clearTimer != null) {
    clearTimeout(clearTimer);
    clearTimer = null;
  }
  seq += 1;
  const durationMs = options?.durationMs ?? (options?.tone === "error" ? 3200 : 2400);
  current = {
    id: seq,
    message: trimmed,
    tone: options?.tone ?? "info",
    durationMs,
  };
  emit();
  clearTimer = setTimeout(() => {
    clearTimer = null;
    current = null;
    emit();
  }, durationMs);
}
