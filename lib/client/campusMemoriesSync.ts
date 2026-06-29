"use client";

type MemoriesSyncListener = () => void;

const listeners = new Set<MemoriesSyncListener>();

/** Broadcast after a Memory is created, deleted, or saved — Realm + Quad refresh without reload. */
export function notifyCampusMemoriesChanged(): void {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      /* non-blocking */
    }
  });
}

export function subscribeCampusMemoriesChanged(listener: MemoriesSyncListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
