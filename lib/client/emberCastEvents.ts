"use client";

export type EmberCastAnchor = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type EmberCastEvent = {
  noteId: string;
  remainingAfter: number;
  unlimited?: boolean;
  /** Snapshot so the cast survives post remounts. */
  anchor?: EmberCastAnchor;
};

type CastListener = (event: EmberCastEvent) => void;
type DismissListener = (noteId: string) => void;

const listeners = new Set<CastListener>();
const dismissListeners = new Set<DismissListener>();

function readAnchor(noteId: string): EmberCastAnchor | undefined {
  if (typeof document === "undefined") return undefined;
  const el = document.querySelector(`[data-cq-ember-anchor="${CSS.escape(noteId)}"]`);
  if (!el) return undefined;
  const rect = el.getBoundingClientRect();
  if (!rect.width && !rect.height) return undefined;
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

export function publishEmberCast(event: EmberCastEvent): void {
  const anchor = event.anchor ?? readAnchor(event.noteId);
  const next: EmberCastEvent = { ...event };
  if (anchor) next.anchor = anchor;
  else delete next.anchor;
  Array.from(listeners).forEach((listener) => listener(next));
}

/** Clear an in-flight optimistic cast when the server rejects the award. */
export function dismissEmberCast(noteId: string): void {
  Array.from(dismissListeners).forEach((listener) => listener(noteId));
}

export function subscribeEmberCast(listener: CastListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function subscribeEmberCastDismiss(listener: DismissListener): () => void {
  dismissListeners.add(listener);
  return () => {
    dismissListeners.delete(listener);
  };
}
