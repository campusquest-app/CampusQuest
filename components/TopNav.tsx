"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { ChevronDown, Menu, MessageCircle } from "lucide-react";
import type { Character } from "@/lib/types";
import { TopNavLevelProgress } from "./TopNavLevelProgress";
import { QuadFeedSelector } from "./QuadFeedSelector";
import type { QuadFeedTab } from "./TheQuad";

/** Synced by ResizeObserver — quest drawers use fixed top below this pixel height */
export const TOPNAV_CSS_VAR = "--cq-topnav-h";

export type TopNavProps = {
  username: string | null;
  character: Character | null;
  onOpenMenu?: () => void;
  onOpenInbox?: () => void;
  unreadNotificationCount?: number;
  /** Current Quad feed selection (drives the "CampusQuest ▼" dropdown). */
  feedTab?: QuadFeedTab;
  /** Called when the user picks a feed from the brand dropdown. */
  onSelectFeedTab?: (tab: QuadFeedTab) => void;
};

/** Premium shell header — Instagram-style: icons + centered brand on one row */
export function TopNav({
  character,
  onOpenMenu,
  onOpenInbox,
  unreadNotificationCount,
  feedTab,
  onSelectFeedTab,
}: TopNavProps) {
  const shellRef = useRef<HTMLElement | null>(null);
  const brandTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [feedMenuOpen, setFeedMenuOpen] = useState(false);
  const [brandAnchor, setBrandAnchor] = useState<DOMRect | null>(null);

  const feedSelectorEnabled = Boolean(feedTab && onSelectFeedTab);

  const openFeedMenu = (): void => {
    const rect = brandTriggerRef.current?.getBoundingClientRect() ?? null;
    setBrandAnchor(rect);
    setFeedMenuOpen(true);
  };

  useLayoutEffect(() => {
    const el = shellRef.current;
    if (!el || typeof document === "undefined") return undefined;

    const sync = (): void => {
      const raw = Math.ceil(el.getBoundingClientRect().height);
      document.documentElement.style.setProperty(TOPNAV_CSS_VAR, `${raw}px`);
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
  }, [character?.id, character?.level, character?.totalXP, character?.streakDays]);

  return (
    <header
      ref={shellRef}
      className="cq-top-nav cq-nav-shell-top relative z-10 w-full min-w-0 shrink-0"
      style={{
        paddingTop: "env(safe-area-inset-top, 0px)",
      }}
    >
      <div
        className="cq-top-nav-inner cq-safe-x w-full"
        style={{
          paddingLeft: "max(0.75rem, env(safe-area-inset-left, 0px))",
          paddingRight: "max(0.75rem, env(safe-area-inset-right, 0px))",
        }}
      >
        <div className="cq-top-nav-primary">
          <button
            type="button"
            onClick={onOpenMenu}
            disabled={!character || !onOpenMenu}
            className="cq-nav-icon-btn cq-top-nav-side flex h-[44px] w-[44px] items-center justify-center rounded-2xl transition hover:bg-white/[0.08] hover:text-white active:scale-90 disabled:opacity-40 touch-manipulation"
            aria-label="Open menu"
          >
            <Menu className="h-[25px] w-[25px]" strokeWidth={2.1} />
          </button>

          <div className="cq-top-nav-brand">
            {feedSelectorEnabled ? (
              <button
                ref={brandTriggerRef}
                type="button"
                className="cq-brand-trigger touch-manipulation"
                onClick={() => (feedMenuOpen ? setFeedMenuOpen(false) : openFeedMenu())}
                aria-haspopup="menu"
                aria-expanded={feedMenuOpen}
                aria-label="Choose feed"
              >
                <h1 className="cq-brand-title cq-brand-lockup font-display">
                  <span className="cq-brand-title-glow" aria-hidden />
                  <span className="cq-brand-title-text">CampusQuest</span>
                  <span className="cq-brand-title-glimmer" aria-hidden />
                </h1>
                <ChevronDown
                  className="cq-brand-chevron"
                  strokeWidth={2.6}
                  data-open={feedMenuOpen ? "true" : undefined}
                  aria-hidden
                />
              </button>
            ) : (
              <h1 className="cq-brand-title cq-brand-lockup font-display">
                <span className="cq-brand-title-glow" aria-hidden />
                <span className="cq-brand-title-text">CampusQuest</span>
                <span className="cq-brand-title-glimmer" aria-hidden />
              </h1>
            )}
          </div>

          {character && onOpenInbox ? (
            <button
              type="button"
              onClick={onOpenInbox}
              className="cq-nav-icon-btn cq-top-nav-side relative flex h-[44px] w-[44px] items-center justify-center rounded-2xl transition hover:bg-white/[0.08] hover:text-white active:scale-90 touch-manipulation"
              aria-label={
                (unreadNotificationCount ?? 0) > 0
                  ? `Inbox, ${Math.min(99, unreadNotificationCount ?? 0)} unread`
                  : "Inbox"
              }
            >
              <MessageCircle className="h-[25px] w-[25px]" strokeWidth={2.1} />
              {(unreadNotificationCount ?? 0) > 0 ? (
                <span className="absolute right-1.5 top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">
                  {Math.min(99, unreadNotificationCount ?? 0)}
                </span>
              ) : null}
            </button>
          ) : (
            <div className="cq-top-nav-side h-[44px] w-[44px] shrink-0" aria-hidden />
          )}
        </div>

        {character ? (
          <div className="cq-top-nav-meta">
            <TopNavLevelProgress character={character} />
          </div>
        ) : null}
      </div>

      {feedSelectorEnabled && feedTab && onSelectFeedTab ? (
        <QuadFeedSelector
          open={feedMenuOpen}
          value={feedTab}
          anchorRect={brandAnchor}
          onSelect={onSelectFeedTab}
          onClose={() => setFeedMenuOpen(false)}
        />
      ) : null}
    </header>
  );
}
