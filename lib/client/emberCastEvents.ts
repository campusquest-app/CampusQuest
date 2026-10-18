"use client";

export type EmberCastEvent = {
  noteId: string;
  remainingAfter: number;
  unlimited?: boolean;
};

type Listener = (event: EmberCastEvent) => void;

const listeners = new Set<Listener>();

export function publishEmberCast(event: EmberCastEvent): void {
  Array.from(listeners).forEach((listener) => listener(event));
}

export function subscribeEmberCast(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
