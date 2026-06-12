"use client";

import { useEffect, useRef, type ReactNode } from "react";
import type { AppBottomNavTab } from "@/components/AppBottomNav";
import { useMobileGestureLayers } from "@/components/mobile/MobileGestureLayerProvider";
import { useBottomNavTabSwipe } from "@/lib/client/useBottomNavTabSwipe";
import { readTouchMobileDevice, type SwipeNavDirection } from "@/lib/client/mobileGestures";

export function DashboardTabSwipeShell({
  activeTab,
  tabKey,
  tabEnterDirection,
  onTabEnterDirectionDone,
  onTabChange,
  disabled,
  className,
  children,
}: {
  activeTab: AppBottomNavTab | null;
  tabKey: string;
  tabEnterDirection: SwipeNavDirection | null;
  onTabEnterDirectionDone: () => void;
  onTabChange: (tab: AppBottomNavTab, direction: SwipeNavDirection) => void;
  disabled: boolean;
  className: string;
  children: ReactNode;
}) {
  const shellRef = useRef<HTMLDivElement>(null);
  const { detailLayerCount } = useMobileGestureLayers();
  const touchMobile = readTouchMobileDevice();

  const tabSwipeDisabled =
    disabled ||
    !touchMobile ||
    activeTab == null ||
    detailLayerCount > 0;

  const { dragOffset, dragging, transitionMs } = useBottomNavTabSwipe({
    activeTab,
    onTabChange,
    disabled: tabSwipeDisabled,
    containerRef: shellRef,
  });

  useEffect(() => {
    if (!tabEnterDirection) return undefined;
    const timer = window.setTimeout(onTabEnterDirectionDone, transitionMs);
    return () => window.clearTimeout(timer);
  }, [tabEnterDirection, tabKey, onTabEnterDirectionDone, transitionMs]);

  const enterClass =
    tabEnterDirection === "forward"
      ? "cq-tab-slide-enter-forward"
      : tabEnterDirection === "back"
        ? "cq-tab-slide-enter-back"
        : "";

  return (
    <div
      ref={shellRef}
      key={tabKey}
      className={`cq-tab-swipe-shell ${enterClass} ${className}`.trim()}
      style={{
        transform: dragging || dragOffset !== 0 ? `translateX(${dragOffset}px)` : undefined,
        transition:
          dragging || dragOffset !== 0
            ? dragging
              ? "none"
              : `transform ${transitionMs}ms cubic-bezier(0.32, 0.72, 0, 1)`
            : undefined,
      }}
    >
      {children}
    </div>
  );
}
