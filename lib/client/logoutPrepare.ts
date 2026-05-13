"use client";

/**
 * Small hooks run immediately before `flushUserStateToBackend` so draft UI (e.g. avatar / bio
 * modals) is merged into the persisted character blob — logout then PATCHes the full snapshot.
 */

type PrepareFn = () => void | Promise<void>;

const fns = new Set<PrepareFn>();

export function registerLogoutPrepare(fn: PrepareFn): () => void {
  fns.add(fn);
  return () => {
    fns.delete(fn);
  };
}

export async function runLogoutPrepares(): Promise<void> {
  const snapshot = Array.from(fns);
  for (const fn of snapshot) {
    await Promise.resolve(fn());
  }
}
