"use client";

import { useRef, type CSSProperties, type HTMLAttributes, type ReactNode } from "react";
import { useSwipeBack } from "@/lib/client/useSwipeBack";
import { useRegisterMobileDetailLayer } from "@/components/mobile/MobileGestureLayerProvider";

export function MobileSwipeBackSurface({
  onBack,
  enabled = true,
  children,
  className,
  style,
  ...rest
}: {
  onBack: () => void;
  enabled?: boolean;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
} & Omit<HTMLAttributes<HTMLDivElement>, "style">) {
  const ref = useRef<HTMLDivElement>(null);
  useRegisterMobileDetailLayer(enabled);
  const { dragX, dragging, transitionMs } = useSwipeBack({
    onBack,
    enabled,
    containerRef: ref,
  });

  const mergedStyle: CSSProperties = {
    ...style,
    transform: dragX > 0 ? `translateX(${dragX}px)` : undefined,
    transition:
      dragging || dragX > 0
        ? dragging
          ? "none"
          : `transform ${transitionMs}ms cubic-bezier(0.32, 0.72, 0, 1)`
        : style?.transition,
  };

  return (
    <div
      ref={ref}
      data-cq-swipe-back-root=""
      className={`cq-swipe-back-surface ${className ?? ""}`.trim()}
      style={mergedStyle}
      {...rest}
    >
      {children}
    </div>
  );
}
