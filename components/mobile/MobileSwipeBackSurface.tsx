"use client";

import {
  forwardRef,
  useRef,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
  type Ref,
} from "react";
import { useSwipeBack } from "@/lib/client/useSwipeBack";
import { useRegisterMobileDetailLayer } from "@/components/mobile/MobileGestureLayerProvider";

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (!ref) return;
  if (typeof ref === "function") {
    ref(value);
    return;
  }
  (ref as { current: T | null }).current = value;
}

export const MobileSwipeBackSurface = forwardRef<
  HTMLDivElement,
  {
    onBack: () => void;
    enabled?: boolean;
    children: ReactNode;
    className?: string;
    style?: CSSProperties;
  } & Omit<HTMLAttributes<HTMLDivElement>, "style">
>(function MobileSwipeBackSurface(
  { onBack, enabled = true, children, className, style, ...rest },
  forwardedRef,
) {
  const ref = useRef<HTMLDivElement | null>(null);
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
      ref={(node) => {
        ref.current = node;
        assignRef(forwardedRef, node);
      }}
      data-cq-swipe-back-root=""
      className={`cq-swipe-back-surface ${className ?? ""}`.trim()}
      style={mergedStyle}
      {...rest}
    >
      {children}
    </div>
  );
});
