"use client";

import { getAccessToken } from "@/lib/client/apiSession";
import { fetchAuthed, isMissingSessionError } from "@/lib/client/dashboardApi";
import type { MeProfileRow, MeStatsRow } from "@/lib/client/profileCharacter";

export type MeSessionSnapshot = {
  userId: string;
  profile: MeProfileRow;
  stats: MeStatsRow;
};

const LOG = "[cq:load]";

let committed: MeSessionSnapshot | null = null;
/** One in-flight concurrent profile+stats request (dedupe parallel callers). */
let inflight: Promise<MeSessionSnapshot | null> | null = null;
const subscribers = new Set<(snap: MeSessionSnapshot | null) => void>();

function notify(): void {
  subscribers.forEach((fn) => fn(committed));
}

/** Latest committed snapshot (after bootstrap / explicit commit). Used to avoid redundant API calls (e.g. beginner bundle). */
export function getMeSessionSnapshot(): MeSessionSnapshot | null {
  return committed;
}

export function commitMeSessionSnapshot(snap: MeSessionSnapshot): void {
  committed = snap;
  notify();
}

/** Clear committed snapshot + notify (logout / bootstrap reset). Does not abort in-flight fetch. */
export function invalidateMeSessionCache(): void {
  committed = null;
  notify();
}

/** Drop deduped in-flight profile fetch (logout / missing session). */
export function resetMeSessionInflight(): void {
  inflight = null;
}

export function subscribeMeSessionSnapshot(fn: (snap: MeSessionSnapshot | null) => void): () => void {
  fn(committed);
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

/** Deduplicates concurrent callers; fresh network each invocation (caller should invalidate first on bootstrap restart). */
export async function fetchMeProfileAndStatsDeduped(): Promise<MeSessionSnapshot | null> {
  if (!getAccessToken()) {
    resetMeSessionInflight();
    invalidateMeSessionCache();
    return null;
  }

  if (inflight) {
    console.log(`${LOG} profile+stats using in-flight duplicate (deduped)`);
    return inflight;
  }
  const t0 = typeof performance !== "undefined" ? performance.now() : 0;
  console.log(`${LOG} profile+stats fetch start`);

  inflight = (async () => {
    try {
      const [profile, stats] = await Promise.all([
        fetchAuthed<MeProfileRow>("/api/me/profile"),
        fetchAuthed<MeStatsRow>("/api/me/stats"),
      ]);
      const ms = typeof performance !== "undefined" ? performance.now() - t0 : 0;
      console.log(`${LOG} profile+stats parallel done ${Math.round(ms)}ms`);
      return { userId: profile.id, profile, stats };
    } catch (err) {
      if (isMissingSessionError(err)) {
        invalidateMeSessionCache();
        return null;
      }
      throw err;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}
