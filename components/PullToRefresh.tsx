"use client";

import type { ReactNode } from "react";
import { usePullToRefresh } from "@/lib/client/usePullToRefresh";

export function PullToRefresh({
  onRefresh,
  disabled = false,
  indicatorTop = "var(--cq-topnav-h, 56px)",
  className,
  children,
}: {
  onRefresh: () => Promise<void> | void;
  disabled?: boolean;
  /** CSS top offset for the fixed indicator (Quad uses header stack). */
  indicatorTop?: string;
  className?: string;
  children: ReactNode;
}) {
  const { pullDistance, refreshing, indicatorVisible, progress, label } = usePullToRefresh({
    onRefresh,
    disabled,
  });

  const contentShift = refreshing ? 12 : pullDistance > 0 ? pullDistance * 0.35 : 0;

  return (
    <div className={className ? `cq-ptr-wrap ${className}` : "cq-ptr-wrap"}>
      <div
        className={`cq-ptr-indicator${indicatorVisible ? " is-visible" : ""}${refreshing ? " is-refreshing" : ""}`}
        style={{
          top: indicatorTop,
          height: refreshing ? 44 : Math.max(0, pullDistance),
          opacity: indicatorVisible ? Math.min(1, 0.4 + progress * 0.6) : 0,
        }}
        aria-live="polite"
        aria-busy={refreshing}
      >
        <span
          className="cq-ptr-spinner"
          style={refreshing ? undefined : { transform: `rotate(${Math.round(progress * 300)}deg)` }}
          aria-hidden
        />
        <span className="cq-ptr-label">{label}</span>
      </div>
      <div
        className="cq-ptr-body"
        style={{
          transform: contentShift > 0 ? `translate3d(0, ${contentShift}px, 0)` : undefined,
          transition: pullDistance === 0 && !refreshing ? "transform 220ms ease" : undefined,
        }}
      >
        {children}
      </div>
    </div>
  );
}
