"use client";

import { forwardRef, useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type ForwardedRef, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Calendar, Handshake, Home, Map } from "lucide-react";
import { AvatarDisplay } from "@/components/AvatarDisplay";
import { getCharacter, subscribeCharacterAvatar } from "@/lib/store";
import { useIsDrawerOpen } from "@/lib/client/appDrawerStore";
import { DEFAULT_DISPLAY_AVATAR, normalizeAvatarInput } from "@/lib/resolveAvatarForDisplay";
import { APP_BOTTOM_NAV_HINT_LABELS, APP_BOTTOM_NAV_TABS, type AppBottomNavTab } from "@/lib/client/appBottomNavTabs";
import { isCreatePostModalOpen } from "@/lib/client/modalViewportCleanup";
import {
  computeBottomNavAutoHide,
  readScrollY,
  resolveBottomNavScrollRoot,
} from "@/lib/client/bottomNavAutoHide";
import {
  dockCradlePath,
  dockCradleTopPath,
  DOCK_CRADLE_BUTTON_PX,
  DOCK_CRADLE_DIP_PX,
  DOCK_CRADLE_FILL,
  DOCK_CRADLE_FILL_TOP,
  DOCK_CRADLE_STROKE,
} from "@/lib/client/dockCradlePath";

const DEFAULT_CRADLE = {
  w: 390,
  h: 76,
  d: dockCradlePath({ width: 390, height: 76 }),
  top: dockCradleTopPath({ width: 390 }),
};

function readCssLengthPx(el: HTMLElement, prop: string, fallback: number): number {
  const raw = getComputedStyle(el).getPropertyValue(prop).trim();
  if (!raw) return fallback;
  if (raw.endsWith("px")) {
    const px = Number.parseFloat(raw);
    return Number.isFinite(px) && px > 0 ? px : fallback;
  }
  const probe = document.createElement("div");
  probe.style.cssText = `position:absolute;visibility:hidden;pointer-events:none;height:${raw};width:0;`;
  el.appendChild(probe);
  const px = probe.getBoundingClientRect().height;
  probe.remove();
  return Number.isFinite(px) && px > 0 ? px : fallback;
}

function readDockCradleMetrics(el: HTMLElement): { buttonPx: number; dipPx: number } {
  return {
    buttonPx: readCssLengthPx(el, "--cq-dock-map-size", DOCK_CRADLE_BUTTON_PX),
    dipPx: readCssLengthPx(el, "--cq-dock-cradle-dip", DOCK_CRADLE_DIP_PX),
  };
}

export type { AppBottomNavTab } from "@/lib/client/appBottomNavTabs";
export { APP_BOTTOM_NAV_TABS } from "@/lib/client/appBottomNavTabs";

/** Synced by ResizeObserver on the dock element. */
export const BOTTOM_NAV_CSS_VAR = "--cq-bottom-nav-h";

/** Content clearance above the edge-attached bar (measured height already includes safe area). */
export const CQ_BOTTOM_NAV_CLEARANCE =
  "calc(var(--cq-bottom-nav-h, 4.75rem) + 0.875rem)";

/** Floating action buttons (compose, etc.) sit just above the bar. */
export const CQ_FLOATING_ACTION_BOTTOM =
  "calc(var(--cq-bottom-nav-h, 4.75rem) + 1.25rem)";

const DOCK_TABS: AppBottomNavTab[] = [...APP_BOTTOM_NAV_TABS];

const BOTTOM_NAV_AVATAR_PX = 26;

function useLiveUserAvatar(fallback?: unknown): unknown {
  return useSyncExternalStore(
    subscribeCharacterAvatar,
    () => getCharacter()?.avatar ?? fallback,
    () => fallback,
  );
}

function useLiveCharacterName(): string | undefined {
  return useSyncExternalStore(
    subscribeCharacterAvatar,
    () => getCharacter()?.name,
    () => undefined,
  );
}

function profileInitials(name?: string | null): string {
  const trimmed = name?.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
  }
  return trimmed.slice(0, 2).toUpperCase();
}

function shouldShowInitialsAvatar(avatar: unknown): boolean {
  if (avatar == null) return true;
  if (typeof avatar === "string" && !avatar.trim()) return true;
  return normalizeAvatarInput(avatar) === DEFAULT_DISPLAY_AVATAR;
}

export function AppBottomNav({
  activeTab,
  onSelectTab,
  userAvatar,
  avatarLoading = false,
  showDockLabels = false,
  autoHideOnScroll = false,
}: {
  activeTab: AppBottomNavTab | "other";
  onSelectTab: (tab: AppBottomNavTab) => void;
  userAvatar?: unknown;
  avatarLoading?: boolean;
  showDockLabels?: boolean;
  /** Social / Quad feed only: slide the whole bar off-screen while scrolling down. */
  autoHideOnScroll?: boolean;
}) {
  const navRef = useRef<HTMLElement | null>(null);
  const [cradle, setCradle] = useState(DEFAULT_CRADLE);
  const dockFillId = useId().replace(/:/g, "");
  const liveAvatar = useLiveUserAvatar(userAvatar);
  const characterName = useLiveCharacterName();
  const reduceMotion = useReducedMotion();
  const drawerOpen = useIsDrawerOpen();
  const resolvedActive: AppBottomNavTab | null =
    activeTab === "other" || !DOCK_TABS.includes(activeTab as AppBottomNavTab)
      ? null
      : (activeTab as AppBottomNavTab);

  useLayoutEffect(() => {
    const el = navRef.current;
    if (!el || typeof document === "undefined") return undefined;

    const sync = (): void => {
      const navRect = el.getBoundingClientRect();
      const slide = el.querySelector(".cq-dock-nav__slide");
      const box = slide instanceof HTMLElement ? slide.getBoundingClientRect() : navRect;
      const layoutH = Math.ceil(box.height);
      if (layoutH > 0) {
        document.documentElement.style.setProperty(BOTTOM_NAV_CSS_VAR, `${layoutH}px`);
      }
      const w = Math.max(1, Math.round(box.width));
      const h = Math.max(1, Math.round(box.height));
      const { buttonPx, dipPx } = readDockCradleMetrics(el);
      const d = dockCradlePath({ width: w, height: h, buttonRadius: buttonPx / 2, dip: dipPx });
      const top = dockCradleTopPath({ width: w, buttonRadius: buttonPx / 2, dip: dipPx });
      setCradle((current) => {
        if (current.w === w && current.h === h && current.d === d && current.top === top) return current;
        return { w, h, d, top };
      });
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

  useEffect(() => {
    const el = navRef.current;
    if (!el || !autoHideOnScroll || typeof window === "undefined") {
      el?.classList.remove("cq-dock-nav--autohidden");
      return undefined;
    }

    const root = resolveBottomNavScrollRoot();
    let lastY = readScrollY(root);
    let hidden = false;
    let accumulated = 0;
    let rafId: number | null = null;

    const applyHidden = (next: boolean): void => {
      hidden = next;
      el.classList.toggle("cq-dock-nav--autohidden", next);
    };

    applyHidden(false);

    const onScroll = (): void => {
      // Keep the bar visible while the post composer (or any create modal) is open.
      if (isCreatePostModalOpen()) {
        accumulated = 0;
        if (hidden) applyHidden(false);
        lastY = readScrollY(root);
        return;
      }
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        const currentY = readScrollY(root);
        const delta = currentY - lastY;
        lastY = currentY;
        const next = computeBottomNavAutoHide({
          hidden,
          accumulated,
          delta,
          scrollY: currentY,
        });
        accumulated = next.accumulated;
        if (next.hidden !== hidden) applyHidden(next.hidden);
      });
    };

    // Attribute flips (composer open/close) should force a reveal without waiting for scroll.
    const onModalAttr = (): void => {
      if (!isCreatePostModalOpen()) return;
      accumulated = 0;
      if (hidden) applyHidden(false);
      lastY = readScrollY(root);
    };
    const modalObserver =
      typeof MutationObserver !== "undefined"
        ? new MutationObserver(onModalAttr)
        : null;
    modalObserver?.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-cq-create-post-open"],
    });

    root.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      root.removeEventListener("scroll", onScroll);
      modalObserver?.disconnect();
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      applyHidden(false);
    };
  }, [autoHideOnScroll]);

  const guardNav = (action: () => void) => {
    if (drawerOpen) return;
    action();
  };

  const mapActive = resolvedActive === "realm";

  return (
    <motion.nav
      ref={navRef}
      className={`cq-dock-nav${drawerOpen ? " cq-dock-nav--drawer-open" : ""}`}
      aria-label="Main navigation"
      aria-hidden={drawerOpen ? true : undefined}
      inert={drawerOpen ? true : undefined}
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={reduceMotion ? undefined : { opacity: 1 }}
      exit={reduceMotion ? undefined : { opacity: 0 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="cq-dock-nav__slide">
      <svg
        className="cq-dock-nav__shape"
        viewBox={`0 0 ${cradle.w} ${cradle.h}`}
        preserveAspectRatio="none"
        aria-hidden
      >
        <defs>
          <linearGradient id={`cq-dock-fill-${dockFillId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={DOCK_CRADLE_FILL_TOP} />
            <stop offset="100%" stopColor={DOCK_CRADLE_FILL} />
          </linearGradient>
        </defs>
        <path d={cradle.d} fill={`url(#cq-dock-fill-${dockFillId})`} />
        <path
          className="cq-dock-nav__shape-stroke"
          d={cradle.top}
          fill="none"
          stroke={DOCK_CRADLE_STROKE}
          strokeWidth={1.25}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="cq-dock-nav__rail">
        <DockItem
          label="Home"
          caption={APP_BOTTOM_NAV_HINT_LABELS.quad}
          active={resolvedActive === "quad"}
          onClick={() => guardNav(() => onSelectTab("quad"))}
          icon={<Home className="cq-dock-nav__glyph" strokeWidth={2.25} />}
        />

        <DockItem
          label="Community Quests"
          caption="Perks"
          active={resolvedActive === "partners"}
          onClick={() => guardNav(() => onSelectTab("partners"))}
          icon={<Handshake className="cq-dock-nav__glyph" strokeWidth={2.25} />}
        />

        <div className={`cq-dock-nav__map-slot${mapActive ? " cq-dock-nav__map-slot--active" : ""}`}>
          <button
            type="button"
            onClick={() => guardNav(() => onSelectTab("realm"))}
            aria-current={mapActive ? "page" : undefined}
            aria-label={mapActive ? "Explore, current page" : "Explore"}
            className={`cq-dock-nav__map-btn cq-map-fab cq-tap-press touch-manipulation${
              mapActive ? " cq-dock-nav__map-btn--active" : ""
            }`}
          >
            <Map className="cq-dock-nav__map-glyph" strokeWidth={2.25} />
          </button>
          <span className="cq-dock-nav__label">Map</span>
          <span className="cq-dock-nav__dot" aria-hidden />
          {showDockLabels ? (
            <span className="sr-only">{APP_BOTTOM_NAV_HINT_LABELS.realm}</span>
          ) : null}
        </div>

        <DockItem
          label={APP_BOTTOM_NAV_HINT_LABELS.events}
          active={resolvedActive === "events"}
          onClick={() => guardNav(() => onSelectTab("events"))}
          icon={<Calendar className="cq-dock-nav__glyph" strokeWidth={2.25} />}
        />

        <DockProfileItem
          label={APP_BOTTOM_NAV_HINT_LABELS.character}
          active={resolvedActive === "character"}
          onClick={() => guardNav(() => onSelectTab("character"))}
          avatar={liveAvatar}
          initials={profileInitials(characterName)}
          useInitials={shouldShowInitialsAvatar(liveAvatar)}
          loading={avatarLoading}
        />
      </div>
      </div>
    </motion.nav>
  );
}

const DockItem = forwardRef(function DockItem(
  {
    label,
    caption,
    active,
    onClick,
    icon,
    badge = false,
    reserveBadge = false,
    itemClassName,
  }: {
    label: string;
    /** Visible caption when it should be shorter than the accessible name. */
    caption?: string;
    active: boolean;
    onClick: () => void;
    icon: ReactNode;
    badge?: boolean;
    /** Keep layout stable when badge appears/disappears. */
    reserveBadge?: boolean;
    itemClassName?: string;
  },
  ref: ForwardedRef<HTMLButtonElement>,
) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      aria-label={
        badge
          ? active
            ? `${label}, unread, current page`
            : `${label}, unread`
          : active
            ? `${label}, current page`
            : label
      }
      className={`cq-dock-nav__item touch-manipulation cq-tap-press ${active ? "cq-dock-nav__item--active" : ""}${itemClassName ? ` ${itemClassName}` : ""}`}
    >
      <span className="cq-dock-nav__icon-wrap">
        {icon}
        {reserveBadge || badge ? (
          <span
            className={`cq-dock-nav__badge${badge ? "" : " cq-dock-nav__badge--hidden"}`}
            aria-hidden
          />
        ) : null}
      </span>
      <span className="cq-dock-nav__label">{caption ?? label}</span>
      <span className="cq-dock-nav__dot" aria-hidden />
    </button>
  );
});

const DockProfileItem = forwardRef(function DockProfileItem(
  {
    label,
    active,
    onClick,
    avatar,
    initials,
    useInitials = false,
    loading,
  }: {
    label: string;
    active: boolean;
    onClick: () => void;
    avatar?: unknown;
    initials: string;
    useInitials?: boolean;
    loading?: boolean;
  },
  ref: ForwardedRef<HTMLButtonElement>,
) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      aria-label={active ? "Profile, current page" : "Profile"}
      className={`cq-dock-nav__item cq-dock-nav__item--profile touch-manipulation cq-tap-press ${active ? "cq-dock-nav__item--active" : ""}`}
    >
      <span className="cq-dock-nav__icon-wrap">
        <span className={`cq-dock-nav__avatar ${active ? "cq-dock-nav__avatar--active" : ""}`}>
          {loading ? (
            <span className="cq-dock-nav__avatar-placeholder" aria-hidden />
          ) : useInitials ? (
            <span className="cq-dock-nav__avatar-initials" aria-hidden>
              {initials}
            </span>
          ) : (
            <AvatarDisplay
              key={typeof avatar === "string" ? avatar : JSON.stringify(avatar ?? "")}
              avatar={avatar}
              size={BOTTOM_NAV_AVATAR_PX}
              fitParent
              showProp={false}
            />
          )}
        </span>
      </span>
      <span className="cq-dock-nav__label">{label}</span>
      <span className="cq-dock-nav__dot" aria-hidden />
    </button>
  );
});
