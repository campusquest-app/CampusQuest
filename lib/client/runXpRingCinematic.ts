import { logXpAnimation, logXpMobile } from "@/lib/client/xpAnimationDebug";
import type { RewardAnimationSnapshot } from "@/lib/client/rewardAnimationSnapshot";
import type { XpRingFillSegment } from "@/lib/xpOverlayMath";

export type XpRingVisualState = {
  baseFill: number;
  gainFill: number;
  gainOpacity: number;
  phase: "idle" | "fill" | "hold" | "blend" | "done";
  filling: boolean;
  activeSeg: number;
  gainStart: number;
};

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function idleAt(seg: XpRingFillSegment, index: number): XpRingVisualState {
  const start = clamp01(seg.baseStart);
  return {
    baseFill: start,
    gainFill: start,
    gainOpacity: 1,
    phase: "idle",
    filling: false,
    activeSeg: index,
    gainStart: start,
  };
}

export type RunXpRingCinematicOpts = {
  snapshot: RewardAnimationSnapshot;
  fillDurationMs: number;
  highlightHoldMs: number;
  highlightBlendMs: number;
  /** Hold completed dark-blue bar before overlay continues (ms). */
  completedHoldMs?: number;
  leveledUp: boolean;
  onVisual: (visual: XpRingVisualState) => void;
  onFillProgress?: (t: number, segmentIndex: number) => void;
  /** Fires when earned segment fill hits 100% (before cyan→blue blend). */
  onFillComplete?: () => void;
  onCelebrationHoldStart?: () => void;
  onCelebrationHoldEnd?: () => void;
  onSegmentComplete?: (index: number) => void;
  shouldCancel?: () => boolean;
};

/** Parent-driven rAF fill (mobile-safe — no effect restarts on fillEnabled). */
export async function runXpRingCinematic(opts: RunXpRingCinematicOpts): Promise<void> {
  const { snapshot, fillDurationMs, highlightHoldMs, highlightBlendMs, leveledUp } = opts;
  const segments = snapshot.segments;

  for (let index = 0; index < segments.length; index++) {
    if (opts.shouldCancel?.()) return;

    const seg = segments[index]!;
    const start = clamp01(seg.baseStart);
    const end = clamp01(seg.gainEnd);
    const span = end - start;

    logXpAnimation("fill_started", { segmentIndex: index, start, end, span });

    opts.onVisual({
      baseFill: start,
      gainFill: start,
      gainOpacity: 1,
      phase: "fill",
      filling: true,
      activeSeg: index,
      gainStart: start,
    });

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
        const eased = easeOutCubic(t);
        const gain = start + span * eased;
        opts.onVisual({
          baseFill: start,
          gainFill: gain,
          gainOpacity: 1,
          phase: "fill",
          filling: true,
          activeSeg: index,
          gainStart: start,
        });
        opts.onFillProgress?.(t, index);
        if (index === 0 && t > 0 && t < 1 && Math.floor(t * 20) % 5 === 0) {
          logXpAnimation("tick", {
            segmentIndex: index,
            t: Number(t.toFixed(2)),
            gain: Number(gain.toFixed(3)),
          });
        }
        if (t < 1) raf = requestAnimationFrame(tick);
        else {
          opts.onFillProgress?.(1, index);
          resolve();
        }
      };
      raf = requestAnimationFrame(tick);
    });

    if (opts.shouldCancel?.()) return;

    if (index === segments.length - 1) {
      opts.onFillComplete?.();
      logXpMobile("fill_complete", { segmentIndex: index });
    }

    opts.onVisual({
      baseFill: start,
      gainFill: end,
      gainOpacity: 1,
      phase: "hold",
      filling: false,
      activeSeg: index,
      gainStart: start,
    });
    await sleep(highlightHoldMs);
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
        const t = Math.min(1, (now - blendT0) / highlightBlendMs);
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

    opts.onSegmentComplete?.(index);

    if (index < segments.length - 1) {
      await sleep(leveledUp ? 320 : 160);
    }
  }

  const last = segments[segments.length - 1]!;
  opts.onVisual({
    baseFill: last.gainEnd,
    gainFill: last.gainEnd,
    gainOpacity: 0,
    phase: "done",
    filling: false,
    activeSeg: segments.length - 1,
    gainStart: clamp01(last.baseStart),
  });

  const holdMs = opts.completedHoldMs ?? 0;
  if (holdMs > 0) {
    opts.onCelebrationHoldStart?.();
    logXpAnimation("celebration_hold", { holdMs });
    await sleep(holdMs);
    if (opts.shouldCancel?.()) return;
    opts.onCelebrationHoldEnd?.();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function initialRingVisual(snapshot: RewardAnimationSnapshot): XpRingVisualState {
  return idleAt(snapshot.segments[0]!, 0);
}
