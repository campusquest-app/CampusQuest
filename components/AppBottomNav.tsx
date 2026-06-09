"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { Home, QrCode, User } from "lucide-react";

/** Synced by ResizeObserver on the nav element. */
export const BOTTOM_NAV_CSS_VAR = "--cq-bottom-nav-h";

/** Content clearance above fixed bottom nav (grid row + labels + safe area). */
export const CQ_BOTTOM_NAV_CLEARANCE =
  "calc(var(--cq-bottom-nav-h, 5.75rem) + env(safe-area-inset-bottom, 0px) + 0.5rem)";

/** Floating action buttons (compose, etc.) sit just above the nav bar. */
export const CQ_FLOATING_ACTION_BOTTOM =
  "calc(var(--cq-bottom-nav-h, 5.75rem) + env(safe-area-inset-bottom, 0px) + 1.25rem)";

export type AppBottomNavTab = "quad" | "character";

export function AppBottomNav({
  activeTab,
  onSelectTab,
  onOpenScanner,
}: {
  activeTab: AppBottomNavTab | "other";
  onSelectTab: (tab: AppBottomNavTab) => void;
  onOpenScanner: () => void;
}) {
  const homeActive = activeTab === "quad";
  const profileActive = activeTab === "character";
  const navRef = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const el = navRef.current;
    if (!el || typeof document === "undefined") return undefined;

    const sync = (): void => {
      const raw = Math.ceil(el.getBoundingClientRect().height);
      document.documentElement.style.setProperty(BOTTOM_NAV_CSS_VAR, `${Math.max(88, raw)}px`);
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
      document.documentElement.style.removeProperty(BOTTOM_NAV_CSS_VAR);
    };
  }, []);

  return (
    <nav
      ref={navRef}
      className="cq-bottom-nav cq-nav-shell-bottom fixed inset-x-0 bottom-0 z-50 w-full"
      style={{
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        paddingLeft: "env(safe-area-inset-left, 0px)",
        paddingRight: "env(safe-area-inset-right, 0px)",
      }}
      aria-label="Main navigation"
    >
      <div className="grid w-full grid-cols-3 items-end gap-0 px-3 pb-3 pt-0">
        <NavItem
          label="Quad"
          active={homeActive}
          onClick={() => onSelectTab("quad")}
          icon={<Home className="h-[22px] w-[22px]" strokeWidth={homeActive ? 2.4 : 2} />}
        />

        <div className="flex items-end justify-center">
          <button
            type="button"
            onClick={onOpenScanner}
            aria-label="Open CQ Scanner"
            className="cq-scanner-fab -mt-6 flex h-[4.25rem] w-[4.25rem] flex-col items-center justify-center rounded-full border border-cyan-300/40 bg-gradient-to-b from-cyan-400/90 via-cyan-500/85 to-[#1e6a9a] text-white shadow-[0_0_32px_-4px_rgba(56,189,248,0.75),0_12px_28px_-8px_rgba(0,0,0,0.65)] transition active:scale-95 touch-manipulation"
          >
            <QrCode className="h-7 w-7" strokeWidth={2.2} />
            <span className="cq-bottom-nav-label mt-0.5 text-[9px] font-bold uppercase tracking-[0.14em]">Scan</span>
          </button>
        </div>

        <NavItem
          label="Profile"
          active={profileActive}
          onClick={() => onSelectTab("character")}
          icon={<User className="h-[22px] w-[22px]" strokeWidth={profileActive ? 2.4 : 2} />}
        />
      </div>
    </nav>
  );
}

function NavItem({
  label,
  active,
  onClick,
  icon,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`flex min-h-[3.35rem] translate-y-0.5 flex-col items-center justify-center gap-0.5 rounded-2xl px-2 pb-2 pt-1.5 transition touch-manipulation ${
        active
          ? "text-cyan-100"
          : "text-white/88 hover:text-white active:text-white"
      }`}
    >
      <span
        className={`flex h-10 w-10 items-center justify-center rounded-2xl transition ${
          active
            ? "bg-cyan-500/15 shadow-[0_0_20px_-6px_rgba(56,189,248,0.55)] ring-1 ring-cyan-400/25"
            : ""
        }`}
      >
        {icon}
      </span>
      <span className={`cq-bottom-nav-label text-[10px] font-semibold tracking-wide ${active ? "text-cyan-50" : "text-white/90"}`}>
        {label}
      </span>
    </button>
  );
}
