"use client";

import { forwardRef, useLayoutEffect, useRef, useState, useSyncExternalStore, type ForwardedRef, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Calendar, Home, Map, MessageCircle } from "lucide-react";
import { AvatarDisplay } from "@/components/AvatarDisplay";
import { getCharacter, subscribeCharacterAvatar } from "@/lib/store";
import { useIsDrawerOpen } from "@/lib/client/appDrawerStore";
import { DEFAULT_DISPLAY_AVATAR, normalizeAvatarInput } from "@/lib/resolveAvatarForDisplay";
import { APP_BOTTOM_NAV_HINT_LABELS, APP_BOTTOM_NAV_TABS, type AppBottomNavTab } from "@/lib/client/appBottomNavTabs";

export type { AppBottomNavTab } from "@/lib/client/appBottomNavTabs";
export { APP_BOTTOM_NAV_TABS } from "@/lib/client/appBottomNavTabs";

/** Synced by ResizeObserver on the dock element. */
export const BOTTOM_NAV_CSS_VAR = "--cq-bottom-nav-h";

/** Content clearance above floating dock (pill + offset + safe area). */
export const CQ_BOTTOM_NAV_CLEARANCE =
  "calc(var(--cq-bottom-nav-h, 3.95rem) + var(--cq-dock-bottom-offset, 14px) + env(safe-area-inset-bottom, 0px) + 0.875rem)";

/** Floating action buttons (compose, etc.) sit just above the dock. */
export const CQ_FLOATING_ACTION_BOTTOM =
  "calc(var(--cq-bottom-nav-h, 3.95rem) + var(--cq-dock-bottom-offset, 14px) + env(safe-area-inset-bottom, 0px) + 1.25rem)";

/** Non-Map tabs that participate in the sliding active indicator. */
const INDICATOR_TABS: AppBottomNavTab[] = ["quad", "inbox", "events", "character"];

const DOCK_TABS: AppBottomNavTab[] = [...APP_BOTTOM_NAV_TABS];

const BOTTOM_NAV_AVATAR_PX = 28;

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
  unreadBadgeCount = 0,
  showDockLabels = false,
}: {
  activeTab: AppBottomNavTab | "other";
  onSelectTab: (tab: AppBottomNavTab) => void;
  userAvatar?: unknown;
  avatarLoading?: boolean;
  /** Unread messages badge on Messages. */
  unreadBadgeCount?: number;
  showDockLabels?: boolean;
}) {
  const navRef = useRef<HTMLElement | null>(null);
  const railRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Partial<Record<AppBottomNavTab, HTMLButtonElement | null>>>({});
  const liveAvatar = useLiveUserAvatar(userAvatar);
  const characterName = useLiveCharacterName();
  const showBadge = unreadBadgeCount > 0;
  const reduceMotion = useReducedMotion();
  const drawerOpen = useIsDrawerOpen();
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

  const resolvedActive: AppBottomNavTab | null =
    activeTab === "other" || !DOCK_TABS.includes(activeTab as AppBottomNavTab)
      ? null
      : (activeTab as AppBottomNavTab);

  const indicatorTab =
    resolvedActive && INDICATOR_TABS.includes(resolvedActive) ? resolvedActive : null;

  useLayoutEffect(() => {
    const el = navRef.current;
    if (!el || typeof document === "undefined") return undefined;

    const sync = (): void => {
      const raw = Math.ceil(el.getBoundingClientRect().height);
      document.documentElement.style.setProperty(BOTTOM_NAV_CSS_VAR, `${Math.max(68, raw)}px`);
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

  useLayoutEffect(() => {
    if (!indicatorTab) {
      setIndicator(null);
      return undefined;
    }
    const rail = railRef.current;
    const activeEl = itemRefs.current[indicatorTab];
    if (!rail || !activeEl) return undefined;

    const syncIndicator = (): void => {
      const railRect = rail.getBoundingClientRect();
      const itemRect = activeEl.getBoundingClientRect();
      setIndicator({
        left: itemRect.left - railRect.left,
        width: itemRect.width,
      });
    };

    syncIndicator();
    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => syncIndicator());
      ro.observe(rail);
    }
    window.addEventListener("resize", syncIndicator);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", syncIndicator);
    };
  }, [indicatorTab]);

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
      <div ref={railRef} className="cq-dock-nav__rail">
        {indicator ? (
          <span
            className="cq-dock-nav__indicator"
            aria-hidden
            style={{
              left: indicator.left,
              width: indicator.width,
            }}
          />
        ) : null}

        <DockItem
          ref={(node) => {
            itemRefs.current.quad = node;
          }}
          label={APP_BOTTOM_NAV_HINT_LABELS.quad}
          hint={showDockLabels}
          active={resolvedActive === "quad"}
          onClick={() => guardNav(() => onSelectTab("quad"))}
          icon={
            <Home
              className="h-[26px] w-[26px]"
              strokeWidth={resolvedActive === "quad" ? 2.5 : 2}
              fill={resolvedActive === "quad" ? "currentColor" : "none"}
            />
          }
        />

        <DockItem
          ref={(node) => {
            itemRefs.current.inbox = node;
          }}
          label={APP_BOTTOM_NAV_HINT_LABELS.inbox}
          hint={showDockLabels}
          active={resolvedActive === "inbox"}
          onClick={() => guardNav(() => onSelectTab("inbox"))}
          badge={showBadge}
          reserveBadge
          icon={
            <MessageCircle
              className="h-[26px] w-[26px]"
              strokeWidth={resolvedActive === "inbox" ? 2.5 : 2}
              fill={resolvedActive === "inbox" ? "currentColor" : "none"}
            />
          }
        />

        <div className="cq-dock-nav__map-slot">
          <button
            type="button"
            onClick={() => guardNav(() => onSelectTab("realm"))}
            aria-current={mapActive ? "page" : undefined}
            aria-label={mapActive ? "Explore, current page" : "Explore"}
            className={`cq-dock-nav__map-btn cq-map-fab cq-tap-press touch-manipulation${
              mapActive ? " cq-dock-nav__map-btn--active" : ""
            }`}
          >
            <span className="cq-dock-nav__map-ring cq-pulse-glow" aria-hidden />
            <span className="cq-dock-nav__map-ring cq-dock-nav__map-ring--outer cq-pulse-glow" aria-hidden />
            <Map className="relative z-[1] h-[24px] w-[24px]" strokeWidth={2.2} />
            {showDockLabels ? (
              <span className="cq-dock-nav__hint cq-dock-nav__hint--map">{APP_BOTTOM_NAV_HINT_LABELS.realm}</span>
            ) : null}
          </button>
        </div>

        <DockItem
          ref={(node) => {
            itemRefs.current.events = node;
          }}
          label={APP_BOTTOM_NAV_HINT_LABELS.events}
          hint={showDockLabels}
          active={resolvedActive === "events"}
          onClick={() => guardNav(() => onSelectTab("events"))}
          icon={
            <Calendar
              className="h-[26px] w-[26px]"
              strokeWidth={resolvedActive === "events" ? 2.5 : 2}
              fill={resolvedActive === "events" ? "currentColor" : "none"}
            />
          }
        />

        <DockProfileItem
          ref={(node) => {
            itemRefs.current.character = node;
          }}
          label={APP_BOTTOM_NAV_HINT_LABELS.character}
          hint={showDockLabels}
          active={resolvedActive === "character"}
          onClick={() => guardNav(() => onSelectTab("character"))}
          avatar={liveAvatar}
          initials={profileInitials(characterName)}
          useInitials={shouldShowInitialsAvatar(liveAvatar)}
          loading={avatarLoading}
        />
      </div>
    </motion.nav>
  );
}

const DockItem = forwardRef(function DockItem(
  {
    label,
    active,
    onClick,
    icon,
    badge = false,
    reserveBadge = false,
    hint = false,
  }: {
    label: string;
    active: boolean;
    onClick: () => void;
    icon: ReactNode;
    badge?: boolean;
    /** Keep layout stable when badge appears/disappears. */
    reserveBadge?: boolean;
    hint?: boolean;
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
      className={`cq-dock-nav__item touch-manipulation cq-tap-press ${active ? "cq-dock-nav__item--active" : ""}`}
    >
      <span className={`cq-dock-nav__icon-wrap ${active ? "cq-nav-glow" : ""}`}>
        {icon}
        {hint ? <span className="cq-dock-nav__hint">{label}</span> : null}
        {reserveBadge || badge ? (
          <span
            className={`cq-dock-nav__badge${badge ? "" : " cq-dock-nav__badge--hidden"}`}
            aria-hidden
          />
        ) : null}
      </span>
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
    hint = false,
  }: {
    label: string;
    active: boolean;
    onClick: () => void;
    avatar?: unknown;
    initials: string;
    useInitials?: boolean;
    loading?: boolean;
    hint?: boolean;
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
      <span className={`cq-dock-nav__avatar ${active ? "cq-dock-nav__avatar--active cq-nav-glow" : ""}`}>
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
      {hint ? <span className="cq-dock-nav__hint">{label}</span> : null}
    </button>
  );
});
