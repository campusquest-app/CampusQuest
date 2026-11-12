"use client";

let activeVisitId: string | null = null;
let clearTimer: ReturnType<typeof setTimeout> | null = null;

/** The id stays for this Community visit, including a quick remount. Leaving long enough starts a new one. */
export function beginCommunityVisit(createId: () => string = () => crypto.randomUUID()): string {
  if (clearTimer != null) {
    clearTimeout(clearTimer);
    clearTimer = null;
  }
  if (!activeVisitId) activeVisitId = createId();
  return activeVisitId;
}

export function scheduleEndCommunityVisit(delayMs = 0) {
  if (clearTimer != null) clearTimeout(clearTimer);
  const ending = activeVisitId;
  clearTimer = setTimeout(() => {
    if (activeVisitId === ending) activeVisitId = null;
    clearTimer = null;
  }, delayMs);
}
