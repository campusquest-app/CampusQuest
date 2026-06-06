"use client";

import { useLayoutEffect, useRef } from "react";
import { Menu, MessageCircle } from "lucide-react";
import type { Character } from "@/lib/types";

/** Synced by ResizeObserver — quest drawers use fixed top below this pixel height */
export const TOPNAV_CSS_VAR = "--cq-topnav-h";

export type TopNavProps = {
  username: string | null;
  character: Character | null;
  onOpenMenu?: () => void;
  onOpenInbox?: () => void;
  unreadNotificationCount?: number;
};

/** Premium shell header — toolbar row + centered CAMPUSQUEST brand */
export function TopNav({
  character,
  onOpenMenu,
  onOpenInbox,
  unreadNotificationCount,
}: TopNavProps) {
  const shellRef = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const el = shellRef.current;
    if (!el || typeof document === "undefined") return undefined;

    const sync = (): void => {
      const raw = Math.ceil(el.getBoundingClientRect().height);
      document.documentElement.style.setProperty(TOPNAV_CSS_VAR, `${Math.max(64, raw)}px`);
    };

    sync();
    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => sync());
      ro.observe(el);
    }
    window.addEventListener("resize", sync);
    window.visualViewport?.addEventListener?.("resize", sync);

    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", sync);
      window.visualViewport?.removeEventListener?.("resize", sync);
      document.documentElement.style.removeProperty(TOPNAV_CSS_VAR);
    };
  }, []);

  return (
    <header
      ref={shellRef}
      className="cq-top-nav cq-nav-shell-top fixed inset-x-0 top-0 z-50 w-full min-w-0 shrink-0"
      style={{
        paddingTop: "env(safe-area-inset-top, 0px)",
      }}
    >
      <div
        className="cq-safe-x w-full"
        style={{
          paddingLeft: "max(0.75rem, env(safe-area-inset-left, 0px))",
          paddingRight: "max(0.75rem, env(safe-area-inset-right, 0px))",
        }}
      >
        <div className="flex h-11 items-center justify-between">
          <button
            type="button"
            onClick={onOpenMenu}
            disabled={!character || !onOpenMenu}
            className="cq-nav-icon-btn flex h-10 w-10 items-center justify-center rounded-xl transition hover:bg-white/[0.08] hover:text-white active:scale-95 disabled:opacity-40 touch-manipulation"
            aria-label="Open menu"
          >
            <Menu className="h-[22px] w-[22px]" strokeWidth={2} />
          </button>

          {character && onOpenInbox ? (
            <button
              type="button"
              onClick={onOpenInbox}
              className="cq-nav-icon-btn relative flex h-10 w-10 items-center justify-center rounded-xl transition hover:bg-white/[0.08] hover:text-white active:scale-95 touch-manipulation"
              aria-label={
                (unreadNotificationCount ?? 0) > 0
                  ? `Inbox, ${Math.min(99, unreadNotificationCount ?? 0)} unread`
                  : "Inbox"
              }
            >
              <MessageCircle className="h-[21px] w-[21px]" strokeWidth={2} />
              {(unreadNotificationCount ?? 0) > 0 ? (
                <span className="absolute right-1 top-1 flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">
                  {Math.min(99, unreadNotificationCount ?? 0)}
                </span>
              ) : null}
            </button>
          ) : (
            <div className="h-10 w-10" aria-hidden />
          )}
        </div>

        <div className="flex flex-col items-center px-2 pb-3.5 pt-1">
          <div className="cq-brand-lockup flex items-center justify-center">
            <h1 className="cq-brand-title font-display">
              <span className="cq-brand-title-text">CAMPUSQUEST</span>
              <span className="cq-brand-title-glimmer" aria-hidden />
            </h1>
          </div>
          <span className="cq-brand-rune-line mt-1.5" aria-hidden />
        </div>
      </div>
    </header>
  );
}
