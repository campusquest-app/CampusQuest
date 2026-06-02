"use client";

import { motion } from "framer-motion";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { XpRingFillSegment } from "@/lib/xpOverlayMath";

const NORMAL_STROKE_URI = "#68ABE8";
const GAIN_STROKE = "#7DD3FC";
const GAIN_GLOW = "rgba(125, 211, 252, 0.85)";

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
  glowIntensity?: number;
  size?: number;
  strokeWidth?: number;
  trackColor?: string;
  className?: string;
  children?: React.ReactNode;
  reducedMotion?: boolean;
  /** When false, ring stays at previous progress until parent enables fill. */
  fillEnabled?: boolean;
  /** 0–1 fill progress within current segment (for syncing XP counter). */
  onFillProgress?: (t: number, segmentIndex: number) => void;
  onFillComplete?: () => void;
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
  glowIntensity = 1,
  size = 300,
  strokeWidth = 16,
  trackColor = "rgba(15, 40, 82, 0.92)",
  className,
  children,
  reducedMotion,
  fillEnabled = true,
  onFillProgress,
  onFillComplete,
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
  const onAnimationCompleteRef = useRef(onAnimationComplete);
  onFillProgressRef.current = onFillProgress;
  onFillCompleteRef.current = onFillComplete;
  onAnimationCompleteRef.current = onAnimationComplete;

  const seg = segments[activeSeg] ?? segments[0]!;
  const baseStart = clamp01(seg.baseStart);
  const gainEnd = clamp01(seg.gainEnd);

  useEffect(() => {
    const first = segments[0]!;
    setGainFill(first.baseStart);
    setBaseFill(first.baseStart);
    setGainOpacity(1);
    setFilling(false);

    if (!fillEnabled) {
      setActiveSeg(0);
      setPhase("idle");
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

          if (!fillCompleteRef.current && index === 0) {
            fillCompleteRef.current = true;
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
                if (!animCompleteRef.current) {
                  animCompleteRef.current = true;
                  onAnimationCompleteRef.current?.();
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
    durationMs,
    fillDelayMs,
    fillEnabled,
    highlightBlendMs,
    highlightHoldMs,
    leveledUp,
    reducedMotion,
    segmentsKey,
  ]);

  const r = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;

  const baseLen = clamp01(baseFill) * circumference;
  const gainStart = baseStart;
  const gainLen = Math.max(0, clamp01(gainFill) - gainStart) * circumference;
  const gainOffset = circumference * (1 - gainStart);
  const showGain = gainLen > 0.5 && gainOpacity > 0.02;

  const trailProgress = clamp01(gainFill);
  const trailAngle = trailProgress * 360 - 90;
  const trailRad = (trailAngle * Math.PI) / 180;
  const trailX = cx + r * Math.cos(trailRad);
  const trailY = cy + r * Math.sin(trailRad);
  const glowBlur = 4 + glowIntensity * (filling ? 5 : 3);

  return (
    <motion.div
      className={`relative flex items-center justify-center touch-manipulation ${className ?? ""}`}
      style={{ width: size, height: size }}
      initial={reducedMotion ? false : { scale: 0.88, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
    >
      <svg
        width={size}
        height={size}
        className="absolute inset-0 -rotate-90 transform-gpu"
        style={{
          filter: `drop-shadow(0 0 ${(14 + (filling ? 14 : 0)) * glowIntensity}px rgba(56, 189, 248, 0.45))`,
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
          stroke={NORMAL_STROKE_URI}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${baseLen} ${circumference - baseLen}`}
          strokeDashoffset={0}
          filter={`url(#${filterId})`}
          opacity={0.95}
        />
        {showGain ? (
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={GAIN_STROKE}
            strokeWidth={strokeWidth + 1}
            strokeLinecap="round"
            strokeDasharray={`${gainLen} ${circumference - gainLen}`}
            strokeDashoffset={gainOffset}
            opacity={gainOpacity}
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

      {!reducedMotion && filling && showGain ? (
        <motion.span
          className="pointer-events-none absolute z-[2] rounded-full bg-sky-100 shadow-[0_0_16px_5px_rgba(125,211,252,0.95)]"
          style={{ width: 11, height: 11, left: trailX - 5.5, top: trailY - 5.5 }}
          animate={{ scale: [0.85, 1.4, 0.9], opacity: [0.75, 1, 0.8] }}
          transition={{ duration: 0.4, repeat: Infinity, ease: "easeInOut" }}
          aria-hidden
        />
      ) : null}

      <div className="relative z-[1] flex flex-col items-center justify-center px-6 text-center">{children}</div>
    </motion.div>
  );
}
