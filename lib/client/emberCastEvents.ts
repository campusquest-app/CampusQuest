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

type Listener = (event: EmberCastEvent) => void;

const listeners = new Set<Listener>();

function readAnchor(noteId: string): EmberCastAnchor | undefined {
  if (typeof document === "undefined") return undefined;
  const el = document.querySelector(`[data-cq-ember-anchor="${CSS.escape(noteId)}"]`);
  if (!el) return undefined;
  const rect = el.getBoundingClientRect();
  if (!rect.width && !rect.height) return undefined;
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

export function publishEmberCast(event: EmberCastEvent): void {
  const next = { ...event, anchor: event.anchor ?? readAnchor(event.noteId) };
  Array.from(listeners).forEach((listener) => listener(next));
}

export function subscribeEmberCast(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
