const LOG_PREFIX = "[cq:realm-map]";

export type RealmMapLifecycleStep =
  | "session-start"
  | "api-load"
  | "container-dimensions"
  | "map-creation"
  | "tiles-loaded"
  | "data-fetch-start"
  | "data-fetch-end"
  | "marker-creation"
  | "overlay-creation"
  | "loading-overlay-removal"
  | "visibility-resize";

let sessionStartMs: number | null = null;
const stepTimestamps = new Map<RealmMapLifecycleStep, number>();
let currentStep: RealmMapLifecycleStep = "session-start";
let watchdogTimer: ReturnType<typeof setTimeout> | null = null;

let tilesReady = false;
let apiReady = false;
let apiLoadPromise: Promise<void> | null = null;

function elapsedMs(): number {
  if (sessionStartMs == null) return 0;
  return Math.round(performance.now() - sessionStartMs);
}

export function beginRealmMapSession(): void {
  sessionStartMs = performance.now();
  stepTimestamps.clear();
  markRealmMapStep("session-start");
  startRealmMapWatchdog();
}

export function markRealmMapStep(step: RealmMapLifecycleStep, detail?: Record<string, unknown>): void {
  currentStep = step;
  stepTimestamps.set(step, performance.now());
  if (detail) {
    console.info(`${LOG_PREFIX} ${step} +${elapsedMs()}ms`, detail);
  } else {
    console.info(`${LOG_PREFIX} ${step} +${elapsedMs()}ms`);
  }
}

export function startRealmMapWatchdog(): void {
  clearRealmMapWatchdog();
  watchdogTimer = setTimeout(() => {
    const steps: Record<string, number> = {};
    stepTimestamps.forEach((ts, step) => {
      steps[step] = sessionStartMs != null ? Math.round(ts - sessionStartMs) : 0;
    });
    console.warn(`${LOG_PREFIX} stalled >5s — blocking step: ${currentStep}`, {
      elapsedMs: elapsedMs(),
      steps,
    });
  }, 5_000);
}

export function clearRealmMapWatchdog(): void {
  if (watchdogTimer != null) {
    clearTimeout(watchdogTimer);
    watchdogTimer = null;
  }
}

export function isRealmMapTilesReady(): boolean {
  return tilesReady;
}

export function markRealmMapTilesReady(): void {
  tilesReady = true;
}

export function resetRealmMapTilesReady(): void {
  tilesReady = false;
}

export function isGoogleMapsApiReady(): boolean {
  return apiReady || (typeof window !== "undefined" && Boolean(window.google?.maps));
}

export function markGoogleMapsApiReady(): void {
  apiReady = true;
}

export function resetGoogleMapsApiLoadPromise(): void {
  apiLoadPromise = null;
}

/** Reuse an in-flight or completed Google Maps API load for the app lifetime. */
export function loadGoogleMapsApiOnce(): Promise<void> {
  if (isGoogleMapsApiReady()) {
    return Promise.resolve();
  }
  if (apiLoadPromise) {
    return apiLoadPromise;
  }

  apiLoadPromise = new Promise<void>((resolve, reject) => {
    const startedAt = performance.now();
    const poll = () => {
      if (typeof window === "undefined") return;
      if (window.google?.maps) {
        markGoogleMapsApiReady();
        markRealmMapStep("api-load", { waitedMs: Math.round(performance.now() - startedAt) });
        apiLoadPromise = null;
        resolve();
        return;
      }
      if (performance.now() - startedAt > 30_000) {
        apiLoadPromise = null;
        reject(new Error("Google Maps API load timed out"));
        return;
      }
      window.setTimeout(poll, 50);
    };
    poll();
  });

  return apiLoadPromise;
}
