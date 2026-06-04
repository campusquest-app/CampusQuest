"use client";

import { motion } from "framer-motion";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { XpRingVisualState } from "@/lib/client/runXpRingCinematic";
import type { XpRingFillSegment } from "@/lib/xpOverlayMath";

export type { XpRingVisualState };

/** Filled progress before new gain (dark CampusQuest blue). */
const NORMAL_STROKE_URI = "#1e4a7a";
const NORMAL_STROKE_URI_LIGHT = "#68ABE8";
const GAIN_STROKE = "#7DD3FC";
const GAIN_GLOW = "rgba(125, 211, 252, 0.95)";

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function easeOutCubic(t: number) {
  return 1 - (1 - t) ** 3;
}

export type AnimatedXPRingProps = {
  progressBefore: number;
  progressAfter: number;
  progressPeak?: number;
  fillSegments?: XpRingFillSegment[];
  level: number;
  leveledUp?: boolean;
  durationMs?: number;
  fillDelayMs?: number;
  highlightHoldMs?: number;
  highlightBlendMs?: number;
  /** After final blend, hold completed bar visible (ms). */
  completedHoldMs?: number;
  /** Subtle glow pulse while holding completed state. */
  celebrationPulse?: boolean;
  glowIntensity?: number;
  size?: number;
  strokeWidth?: number;
  trackColor?: string;
  className?: string;
  children?: React.ReactNode;
  reducedMotion?: boolean;
  /** When false, ring stays at previous progress until parent enables fill. */
  fillEnabled?: boolean;
  /** Parent handles overlay entrance — skip inner scale/fade. */
  suppressEntranceMotion?: boolean;
  /** When set, parent drives ring progress (mobile cinematic). */
  externalVisual?: XpRingVisualState | null;
  /** Plain div wrapper — mobile rAF fill (no Framer on ring). */
  disableWrapperMotion?: boolean;
  /** 0–1 fill progress within current segment (for syncing XP counter). */
  onFillProgress?: (t: number, segmentIndex: number) => void;
  onFillComplete?: () => void;
  onCelebrationHoldStart?: () => void;
  onCelebrationHoldEnd?: () => void;
  onAnimationComplete?: () => void;
};

/**
 * Layered ring: fixed base (blue) + cyan arc that grows smoothly, then blends to blue.
 */
export function AnimatedXPRing({
  progressBefore,
  progressAfter,
  fillSegments,
  leveledUp = false,
  durationMs = 1800,
  fillDelayMs = 300,
  highlightHoldMs = 600,
  highlightBlendMs = 750,
  completedHoldMs = 0,
  celebrationPulse = false,
  glowIntensity = 1,
  size = 300,
  strokeWidth = 16,
  trackColor = "rgba(15, 40, 82, 0.92)",
  className,
  children,
  reducedMotion,
  fillEnabled = true,
  suppressEntranceMotion = false,
  externalVisual = null,
  disableWrapperMotion = false,
  onFillProgress,
  onFillComplete,
  onCelebrationHoldStart,
  onCelebrationHoldEnd,
  onAnimationComplete,
}: AnimatedXPRingProps) {
  const filterId = useId().replace(/:/g, "");
  const gainFilterId = `${filterId}-gain`;

  const segments = useMemo(
    (): XpRingFillSegment[] =>
      fillSegments && fillSegments.length > 0
        ? fillSegments
        : [{ baseStart: clamp01(progressBefore), gainEnd: clamp01(progressAfter) }],
    [fillSegments, progressAfter, progressBefore],
  );

  const segmentsKey = useMemo(() => JSON.stringify(segments), [segments]);

  const [activeSeg, setActiveSeg] = useState(0);
  const [gainFill, setGainFill] = useState(segments[0]!.baseStart);
  const [baseFill, setBaseFill] = useState(segments[0]!.baseStart);
  const [gainOpacity, setGainOpacity] = useState(1);
  const [phase, setPhase] = useState<"idle" | "fill" | "hold" | "blend" | "done">("idle");
  const [filling, setFilling] = useState(false);

  const fillCompleteRef = useRef(false);
  const animCompleteRef = useRef(false);
  const onFillProgressRef = useRef(onFillProgress);
  const onFillCompleteRef = useRef(onFillComplete);
  const onCelebrationHoldStartRef = useRef(onCelebrationHoldStart);
  const onCelebrationHoldEndRef = useRef(onCelebrationHoldEnd);
  const onAnimationCompleteRef = useRef(onAnimationComplete);
  onFillProgressRef.current = onFillProgress;
  onFillCompleteRef.current = onFillComplete;
  onCelebrationHoldStartRef.current = onCelebrationHoldStart;
  onCelebrationHoldEndRef.current = onCelebrationHoldEnd;
  onAnimationCompleteRef.current = onAnimationComplete;

  const driven = externalVisual != null;
  const vis = externalVisual;
  const activeSegIndex = driven ? vis!.activeSeg : activeSeg;
  const seg = segments[activeSegIndex] ?? segments[0]!;
  const baseStart = driven ? vis!.gainStart : clamp01(seg.baseStart);
  const gainEnd = clamp01(seg.gainEnd);

  const renderBaseFill = driven ? vis!.baseFill : baseFill;
  const renderGainFill = driven ? vis!.gainFill : gainFill;
  const renderGainOpacity = driven ? vis!.gainOpacity : gainOpacity;
  const renderPhase = driven ? vis!.phase : phase;
  const renderFilling = driven ? vis!.filling : filling;

  useEffect(() => {
    if (driven) return;
    const first = segments[0]!;
    setGainFill(first.baseStart);
    setBaseFill(first.baseStart);
    setGainOpacity(1);
    setFilling(false);
    setActiveSeg(0);
    setPhase("idle");

    if (!fillEnabled) {
      return;
    }

    fillCompleteRef.current = false;
    animCompleteRef.current = false;
    setActiveSeg(0);
    setPhase("idle");

    if (reducedMotion) {
      const last = segments[segments.length - 1]!;
      setGainFill(last.gainEnd);
      setBaseFill(last.gainEnd);
      setPhase("done");
      onFillProgressRef.current?.(1, segments.length - 1);
      onFillCompleteRef.current?.();
      onAnimationCompleteRef.current?.();
      return;
    }

    let cancelled = false;
    let raf = 0;
    let holdTimer = 0;
    let blendRaf = 0;
    let delayTimer = 0;
    let betweenTimer = 0;

    const runBlend = (fromBase: number, toEnd: number, onDone: () => void) => {
      setPhase("blend");
      const blendStart = performance.now();
      const fullGainLen = toEnd - fromBase;

      const tickBlend = (now: number) => {
        if (cancelled) return;
        const t = Math.min(1, (now - blendStart) / highlightBlendMs);
        const eased = easeOutCubic(t);
        setBaseFill(fromBase + fullGainLen * eased);
        setGainOpacity(1 - eased);
        if (t < 1) {
          blendRaf = requestAnimationFrame(tickBlend);
        } else {
          setBaseFill(toEnd);
          setGainFill(toEnd);
          setGainOpacity(0);
          onDone();
        }
      };
      blendRaf = requestAnimationFrame(tickBlend);
    };

    const runSegment = (index: number) => {
      if (cancelled) return;
      const s = segments[index]!;
      const start = clamp01(s.baseStart);
      const end = clamp01(s.gainEnd);
      const span = end - start;

      setActiveSeg(index);
      setGainFill(start);
      setBaseFill(start);
      setGainOpacity(1);
      setPhase("fill");
      setFilling(true);

      const fillStart = performance.now();

      const tickFill = (now: number) => {
        if (cancelled) return;
        const elapsed = now - fillStart;
        const t = Math.min(1, elapsed / durationMs);
        const eased = easeOutCubic(t);
        const p = start + span * eased;
        setGainFill(p);
        onFillProgressRef.current?.(t, index);

        if (t < 1) {
          raf = requestAnimationFrame(tickFill);
        } else {
          setGainFill(end);
          setFilling(false);
          onFillProgressRef.current?.(1, index);

          if (index === segments.length - 1) {
            onFillCompleteRef.current?.();
          }

          setPhase("hold");
          holdTimer = window.setTimeout(() => {
            runBlend(start, end, () => {
              if (index < segments.length - 1) {
                betweenTimer = window.setTimeout(() => runSegment(index + 1), leveledUp ? 320 : 140);
              } else {
                setPhase("done");
                setBaseFill(end);
                setGainFill(end);
                const finish = () => {
                  if (!animCompleteRef.current) {
                    animCompleteRef.current = true;
                    onAnimationCompleteRef.current?.();
                  }
                };
                if (completedHoldMs > 0) {
                  onCelebrationHoldStartRef.current?.();
                  betweenTimer = window.setTimeout(() => {
                    onCelebrationHoldEndRef.current?.();
                    finish();
                  }, completedHoldMs);
                } else {
                  finish();
                }
              }
            });
          }, highlightHoldMs);
        }
      };
      raf = requestAnimationFrame(tickFill);
    };

    delayTimer = window.setTimeout(() => runSegment(0), fillDelayMs);

    return () => {
      cancelled = true;
      window.clearTimeout(delayTimer);
      window.clearTimeout(holdTimer);
      window.clearTimeout(betweenTimer);
      if (raf) cancelAnimationFrame(raf);
      if (blendRaf) cancelAnimationFrame(blendRaf);
    };
  }, [
    driven,
    durationMs,
    fillDelayMs,
    fillEnabled,
    highlightBlendMs,
    completedHoldMs,
    highlightHoldMs,
    leveledUp,
    reducedMotion,
    segmentsKey,
  ]);

  const r = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;

  const baseLen = clamp01(renderBaseFill) * circumference;
  const gainArcStart = baseStart;
  const gainLen = Math.max(0, clamp01(renderGainFill) - gainArcStart) * circumference;
  const gainOffset = circumference * (1 - gainArcStart);
  const showGain = gainLen > 0.25 && renderGainOpacity > 0.02;

  const trailProgress = clamp01(renderGainFill);
  const trailAngle = trailProgress * 360 - 90;
  const trailRad = (trailAngle * Math.PI) / 180;
  const trailX = cx + r * Math.cos(trailRad);
  const trailY = cy + r * Math.sin(trailRad);
  const glowBlur =
    4 + glowIntensity * (renderFilling ? 5 : celebrationPulse ? 4.5 : 3);

  const ringWrapperClass = `relative flex items-center justify-center touch-manipulation ${className ?? ""}`;
  const ringWrapperStyle = { width: size, height: size };

  const ringBody = (
    <>
      <svg
        width={size}
        height={size}
        className="absolute inset-0 -rotate-90 transform-gpu"
        style={{
          filter: `drop-shadow(0 0 ${(14 + (renderFilling ? 14 : 0)) * glowIntensity}px rgba(56, 189, 248, 0.45))`,
          shapeRendering: "geometricPrecision",
        }}
        aria-hidden
      >
        <defs>
          <filter id={filterId} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation={glowBlur} result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id={gainFilterId} x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation={glowBlur + 3} result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={trackColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          opacity={0.92}
        />
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={renderPhase === "done" ? NORMAL_STROKE_URI_LIGHT : NORMAL_STROKE_URI}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${baseLen} ${circumference - baseLen}`}
          strokeDashoffset={0}
          filter={`url(#${filterId})`}
          opacity={0.98}
        />
        {showGain ? (
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={GAIN_STROKE}
            strokeWidth={strokeWidth + 2}
            strokeLinecap="round"
            strokeDasharray={`${gainLen} ${circumference - gainLen}`}
            strokeDashoffset={gainOffset}
            opacity={renderGainOpacity}
            style={{
              filter: `url(#${gainFilterId}) drop-shadow(0 0 ${14 * glowIntensity}px ${GAIN_GLOW})`,
            }}
          />
        ) : null}
        <circle
          cx={cx}
          cy={cy}
          r={r - strokeWidth * 0.12}
          fill="rgba(4, 22, 48, 0.62)"
          stroke="rgba(104, 171, 232, 0.28)"
          strokeWidth={1}
        />
      </svg>

      {!reducedMotion && renderFilling && showGain ? (
        disableWrapperMotion ? (
          <span
            className="pointer-events-none absolute z-[2] rounded-full bg-sky-100 shadow-[0_0_16px_5px_rgba(125,211,252,0.95)]"
            style={{ width: 11, height: 11, left: trailX - 5.5, top: trailY - 5.5 }}
            aria-hidden
          />
        ) : (
          <motion.span
            className="pointer-events-none absolute z-[2] rounded-full bg-sky-100 shadow-[0_0_16px_5px_rgba(125,211,252,0.95)]"
            style={{ width: 11, height: 11, left: trailX - 5.5, top: trailY - 5.5 }}
            animate={{ scale: [0.85, 1.4, 0.9], opacity: [0.75, 1, 0.8] }}
            transition={{ duration: 0.4, repeat: Infinity, ease: "easeInOut" }}
            aria-hidden
          />
        )
      ) : null}

      <div className="relative z-[1] flex flex-col items-center justify-center px-6 text-center">{children}</div>
    </>
  );

  if (disableWrapperMotion) {
    return (
      <div className={ringWrapperClass} style={ringWrapperStyle}>
        {ringBody}
      </div>
    );
  }

  return (
    <motion.div
      className={ringWrapperClass}
      style={ringWrapperStyle}
      initial={reducedMotion || suppressEntranceMotion ? false : { scale: 0.88, opacity: 0 }}
      animate={{
        scale: celebrationPulse ? [1, 1.012, 1] : 1,
        opacity: 1,
      }}
      transition={
        celebrationPulse
          ? { duration: 1.8, repeat: Infinity, ease: "easeInOut" }
          : suppressEntranceMotion
            ? { duration: 0 }
            : { duration: 0.35, ease: [0.22, 1, 0.36, 1] }
      }
    >
      {ringBody}
    </motion.div>
  );
}
