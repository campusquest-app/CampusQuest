"use client";

import { motion, useSpring, useTransform } from "framer-motion";
import { useEffect } from "react";

export type AnimatedXPRingProps = {
  /** 0–1 progress within current level */
  progress: number;
  size?: number;
  strokeWidth?: number;
  ringColor: string;
  trackColor: string;
  glowFilterId?: string;
  className?: string;
  children?: React.ReactNode;
  /** Softer motion for reduced-motion users */
  reducedMotion?: boolean;
};

/**
 * SVG circular progress ring with neon RPG styling; progress is spring-smoothed.
 */
export function AnimatedXPRing({
  progress,
  size = 300,
  strokeWidth = 14,
  ringColor: _ringColor,
  trackColor,
  glowFilterId = "xp-ring-glow",
  className,
  children,
  reducedMotion,
}: AnimatedXPRingProps) {
  const p = Math.max(0, Math.min(1, progress));
  const spring = useSpring(p, {
    stiffness: reducedMotion ? 200 : 56,
    damping: reducedMotion ? 40 : 22,
    mass: reducedMotion ? 0.6 : 1,
  });

  useEffect(() => {
    spring.set(p);
  }, [p, spring]);

  const r = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const offset = useTransform(spring, (v) => circumference * (1 - Math.max(0, Math.min(1, v))));

  return (
    <div
      className={`relative flex items-center justify-center touch-manipulation ${className ?? ""}`}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        className="absolute inset-0 -rotate-90 transform-gpu drop-shadow-[0_0_28px_rgba(104,171,232,0.35)]"
        aria-hidden
      >
        <defs>
          <filter id={glowFilterId} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id={`${glowFilterId}-grad`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#93c5fd" stopOpacity="0.95" />
            <stop offset="50%" stopColor="#68ABE8" stopOpacity="1" />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.9" />
          </linearGradient>
        </defs>
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={trackColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          opacity={0.9}
        />
        <motion.circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={`url(#${glowFilterId}-grad)`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          style={{ strokeDashoffset: offset }}
          filter={`url(#${glowFilterId})`}
        />
        <circle
          cx={cx}
          cy={cy}
          r={r - strokeWidth * 0.15}
          fill="rgba(4, 30, 66, 0.55)"
          stroke="rgba(104, 171, 232, 0.2)"
          strokeWidth={1}
        />
      </svg>
      <div className="relative z-[1] flex flex-col items-center justify-center px-6 text-center">{children}</div>
    </div>
  );
}
