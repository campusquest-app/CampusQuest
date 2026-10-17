/**
 * Limits concurrent Quad feed video network attachments so Mobile Safari does
 * not stall buffering several MP4s at once.
 */

export const QUAD_FEED_MAX_CONCURRENT_VIDEO_LOADS = 1;

type Waiter = {
  id: string;
  resolve: (granted: boolean) => void;
};

let active = 0;
const waiters: Waiter[] = [];
const holders = new Set<string>();

function pump() {
  while (active < QUAD_FEED_MAX_CONCURRENT_VIDEO_LOADS && waiters.length > 0) {
    const next = waiters.shift()!;
    active += 1;
    holders.add(next.id);
    next.resolve(true);
  }
}

/** Request a video-load slot. Resolves false if aborted before grant. */
export function acquireVideoLoadSlot(
  id: string,
  signal?: AbortSignal,
): Promise<boolean> {
  if (holders.has(id)) return Promise.resolve(true);
  if (signal?.aborted) return Promise.resolve(false);

  if (active < QUAD_FEED_MAX_CONCURRENT_VIDEO_LOADS) {
    active += 1;
    holders.add(id);
    return Promise.resolve(true);
  }

  return new Promise<boolean>((resolve) => {
    const waiter: Waiter = { id, resolve };
    const onAbort = () => {
      const idx = waiters.indexOf(waiter);
      if (idx >= 0) waiters.splice(idx, 1);
      resolve(false);
    };
    if (signal) {
      signal.addEventListener("abort", onAbort, { once: true });
    }
    waiters.push(waiter);
  });
}

export function releaseVideoLoadSlot(id: string): void {
  if (!holders.has(id)) {
    // Still remove from queue if waiting.
    const idx = waiters.findIndex((w) => w.id === id);
    if (idx >= 0) {
      const [removed] = waiters.splice(idx, 1);
      removed?.resolve(false);
    }
    return;
  }
  holders.delete(id);
  active = Math.max(0, active - 1);
  pump();
}

/** Test helper — reset singleton state. */
export function resetVideoLoadGateForTests(): void {
  active = 0;
  holders.clear();
  while (waiters.length) {
    waiters.shift()?.resolve(false);
  }
}

export function videoLoadGateSnapshotForTests(): { active: number; waiting: number; holders: string[] } {
  return { active, waiting: waiters.length, holders: Array.from(holders) };
}
