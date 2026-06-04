import { logMobileXp } from "@/lib/client/mobileXpAnimationDebug";
import type { RewardAnimationSnapshot } from "@/lib/client/rewardAnimationSnapshot";
import type { XpRingVisualState } from "@/lib/client/runXpRingCinematic";
import {
  computeVisualProgressKeyframes,
  interpolateVisualProgress,
} from "@/lib/xpOverlayMath";

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function idleVisual(snapshot: RewardAnimationSnapshot): XpRingVisualState {
  const start = clamp01(snapshot.segments[0]?.baseStart ?? snapshot.previousProgress);
  return {
    baseFill: start,
    gainFill: start,
    gainOpacity: 1,
    phase: "idle",
    filling: false,
    activeSeg: 0,
    gainStart: start,
  };
}

function visualFill(
  start: number,
  gain: number,
  index: number,
  gainStart: number,
): XpRingVisualState {
  return {
    baseFill: start,
    gainFill: gain,
    gainOpacity: 1,
    phase: "fill",
    filling: true,
    activeSeg: index,
    gainStart,
  };
}

export type RunMobileXpRewardFillOpts = {
  snapshot: RewardAnimationSnapshot;
  fillDurationMs: number;
  blendMs: number;
  holdMs: number;
  completedHoldMs: number;
  onVisual: (visual: XpRingVisualState) => void;
  onDisplayXP: (xp: number) => void;
  onTick?: (t: number, progress: number) => void;
  shouldCancel?: () => boolean;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/** Mobile-only rAF ring fill — no Framer Motion. */
export async function runMobileXpRewardFill(opts: RunMobileXpRewardFillOpts): Promise<void> {
  const { snapshot, fillDurationMs, blendMs, holdMs, completedHoldMs } = opts;
  const segments = snapshot.segments;
  const xpSpan = snapshot.finalXP - snapshot.previousXP;

  opts.onVisual(idleVisual(snapshot));
  opts.onDisplayXP(snapshot.previousXP);

  logMobileXp("snapshot", {
    previousXP: snapshot.previousXP,
    finalXP: snapshot.finalXP,
    xpGained: snapshot.xpGained,
    previousProgress: snapshot.previousProgress,
    finalProgress: snapshot.finalProgress,
    segmentCount: segments.length,
  });
  logMobileXp("previous_progress", { value: snapshot.previousProgress });
  logMobileXp("final_progress", { value: snapshot.finalProgress });
  logMobileXp("raf_started", { durationMs: fillDurationMs });

  for (let index = 0; index < segments.length; index++) {
    if (opts.shouldCancel?.()) return;

    const seg = segments[index]!;
    const start = clamp01(seg.baseStart);
    const end = clamp01(seg.gainEnd);
    const span = end - start;
    const keyframes = computeVisualProgressKeyframes(start, end, snapshot.xpGained);

    await new Promise<void>((resolve) => {
      const t0 = performance.now();
      let raf = 0;

      const tick = (now: number) => {
        if (opts.shouldCancel?.()) {
          if (raf) cancelAnimationFrame(raf);
          resolve();
          return;
        }

        const t = Math.min(1, (now - t0) / fillDurationMs);
        const gain = interpolateVisualProgress(t, keyframes.start, keyframes.peak, keyframes.end);
        opts.onVisual(visualFill(start, gain, index, start));

        const overall =
          segments.length === 1
            ? t
            : (index + t) / segments.length;
        const display = Math.round(snapshot.previousXP + xpSpan * easeOutCubic(overall));
        opts.onDisplayXP(display);
        opts.onTick?.(t, gain);

        if (Math.floor(t * 20) % 4 === 0) {
          logMobileXp("raf_tick", {
            t: Number(t.toFixed(2)),
            gain: Number(gain.toFixed(3)),
            displayXP: display,
          });
        }

        if (t < 1) {
          raf = requestAnimationFrame(tick);
        } else {
          opts.onVisual({
            baseFill: start,
            gainFill: end,
            gainOpacity: 1,
            phase: "hold",
            filling: false,
            activeSeg: index,
            gainStart: start,
          });
          resolve();
        }
      };

      raf = requestAnimationFrame(tick);
    });

    if (opts.shouldCancel?.()) return;

    await sleep(holdMs);
    if (opts.shouldCancel?.()) return;

    await new Promise<void>((resolve) => {
      const blendT0 = performance.now();
      let raf = 0;
      const tickBlend = (now: number) => {
        if (opts.shouldCancel?.()) {
          if (raf) cancelAnimationFrame(raf);
          resolve();
          return;
        }
        const t = Math.min(1, (now - blendT0) / blendMs);
        const eased = easeOutCubic(t);
        opts.onVisual({
          baseFill: start + span * eased,
          gainFill: end,
          gainOpacity: 1 - eased,
          phase: "blend",
          filling: false,
          activeSeg: index,
          gainStart: start,
        });
        if (t < 1) raf = requestAnimationFrame(tickBlend);
        else resolve();
      };
      raf = requestAnimationFrame(tickBlend);
    });

    if (index < segments.length - 1) {
      await sleep(160);
    }
  }

  const last = segments[segments.length - 1]!;
  const end = clamp01(last.gainEnd);
  opts.onVisual({
    baseFill: end,
    gainFill: end,
    gainOpacity: 0,
    phase: "done",
    filling: false,
    activeSeg: segments.length - 1,
    gainStart: clamp01(last.baseStart),
  });
  opts.onDisplayXP(snapshot.finalXP);

  if (completedHoldMs > 0) {
    await sleep(completedHoldMs);
  }

  logMobileXp("raf_complete", {
    finalXP: snapshot.finalXP,
    finalProgress: snapshot.finalProgress,
  });
}

export function mobileInitialRingVisual(snapshot: RewardAnimationSnapshot): XpRingVisualState {
  return idleVisual(snapshot);
}

/** Wait two frames so the browser paints previous progress before fill. */
export function waitTwoAnimationFrames(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}
