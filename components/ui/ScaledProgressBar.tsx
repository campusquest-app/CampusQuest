"use client";

import { useEffect, useState, type ReactNode } from "react";

const DEFAULT_DURATION_MS = 700;
const EASE_OUT_CUBIC = "cubic-bezier(0.33, 1, 0.68, 1)";

export type ScaledProgressBarProps = {
  percent: number;
  trackClassName?: string;
  fillClassName?: string;
  delayMs?: number;
  durationMs?: number;
  animationKey?: string;
  shimmerAfterEnter?: boolean;
  sparkle?: boolean;
  children?: ReactNode;
  role?: string;
  "aria-valuenow"?: number;
  "aria-valuemin"?: number;
  "aria-valuemax"?: number;
  "aria-label"?: string;
};

/**
 * GPU-friendly progress fill — animates via transform: scaleX(), not width.
 * Safari/iOS reliably composites transform + opacity animations.
 */
export function ScaledProgressBar({
  percent,
  trackClassName = "cq-scaled-progress-track",
  fillClassName = "cq-scaled-progress-fill",
  delayMs = 0,
  durationMs = DEFAULT_DURATION_MS,
  animationKey = "default",
  shimmerAfterEnter = true,
  sparkle = false,
  children,
  role,
  "aria-valuenow": ariaValueNow,
  "aria-valuemin": ariaValueMin,
  "aria-valuemax": ariaValueMax,
  "aria-label": ariaLabel,
}: ScaledProgressBarProps) {
  const scale = Math.min(1, Math.max(0, percent / 100));
  const [ready, setReady] = useState(scale === 0);
  const [shimmer, setShimmer] = useState(false);

  useEffect(() => {
    if (scale === 0) {
      setReady(true);
      setShimmer(false);
      return undefined;
    }

    setReady(false);
    setShimmer(false);

    const enterFrame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => setReady(true));
    });

    let shimmerTimer: number | undefined;
    if (shimmerAfterEnter) {
      shimmerTimer = window.setTimeout(
        () => setShimmer(true),
        delayMs + durationMs + 48,
      );
    }

    return () => {
      window.cancelAnimationFrame(enterFrame);
      if (shimmerTimer !== undefined) window.clearTimeout(shimmerTimer);
    };
  }, [animationKey, scale, delayMs, durationMs, shimmerAfterEnter]);

  const ariaProps =
    role != null
      ? {
          role,
          "aria-valuenow": ariaValueNow,
          "aria-valuemin": ariaValueMin,
          "aria-valuemax": ariaValueMax,
          "aria-label": ariaLabel,
        }
      : {};

  const trackClasses = [trackClassName, "cq-scaled-progress-track"].filter(Boolean).join(" ");
  const fillClasses = [
    "cq-scaled-progress-fill",
    fillClassName,
    shimmer ? "cq-bar-shimmer-once" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={trackClasses} {...ariaProps}>
      <div
        className="cq-scaled-progress-fill-wrap"
        style={{
          transform: `translateZ(0) scaleX(${ready ? scale : 0})`,
          transitionDuration: `${durationMs}ms`,
          transitionDelay: `${delayMs}ms`,
          transitionTimingFunction: EASE_OUT_CUBIC,
        }}
      >
        <div className={fillClasses}>
          {sparkle ? <span className="cq-bar-sparkle" aria-hidden /> : null}
          {children}
        </div>
      </div>
    </div>
  );
}
