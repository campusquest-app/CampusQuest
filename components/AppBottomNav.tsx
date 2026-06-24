"use client";

import { forwardRef, useLayoutEffect, useRef, useState, useSyncExternalStore, type ForwardedRef, type ReactNode } from "react";
import { Home, Map, QrCode, Trophy } from "lucide-react";
import { AvatarDisplay } from "@/components/AvatarDisplay";
import { getCharacter, subscribeCharacterAvatar } from "@/lib/store";
import { DEFAULT_DISPLAY_AVATAR, normalizeAvatarInput } from "@/lib/resolveAvatarForDisplay";

/** Synced by ResizeObserver on the dock element. */
export const BOTTOM_NAV_CSS_VAR = "--cq-bottom-nav-h";

/** Content clearance above floating dock (pill + offset + safe area). */
export const CQ_BOTTOM_NAV_CLEARANCE =
  "calc(var(--cq-bottom-nav-h, 3.75rem) + var(--cq-dock-bottom-offset, 14px) + env(safe-area-inset-bottom, 0px) + 0.875rem)";

/** Floating action buttons (compose, etc.) sit just above the dock. */
export const CQ_FLOATING_ACTION_BOTTOM =
  "calc(var(--cq-bottom-nav-h, 3.75rem) + var(--cq-dock-bottom-offset, 14px) + env(safe-area-inset-bottom, 0px) + 1.25rem)";

export type AppBottomNavTab = "quad" | "realm" | "leaderboards" | "character";

const BOTTOM_NAV_AVATAR_PX = 26;

const DOCK_TABS: AppBottomNavTab[] = ["quad", "realm", "leaderboards", "character"];

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
  onOpenScanner,
  userAvatar,
  avatarLoading = false,
  unreadBadgeCount = 0,
}: {
  activeTab: AppBottomNavTab | "other";
  onSelectTab: (tab: AppBottomNavTab) => void;
  onOpenScanner: () => void;
  userAvatar?: unknown;
  avatarLoading?: boolean;
  /** Unread messages / notifications — dot on Profile. */
  unreadBadgeCount?: number;
}) {
  const navRef = useRef<HTMLElement | null>(null);
  const railRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Partial<Record<AppBottomNavTab, HTMLButtonElement | null>>>({});
  const liveAvatar = useLiveUserAvatar(userAvatar);
  const characterName = useLiveCharacterName();
  const showBadge = unreadBadgeCount > 0;
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

  const resolvedActive: AppBottomNavTab | null =
    activeTab === "other" || !DOCK_TABS.includes(activeTab as AppBottomNavTab)
      ? null
      : (activeTab as AppBottomNavTab);

  useLayoutEffect(() => {
    const el = navRef.current;
    if (!el || typeof document === "undefined") return undefined;

    const sync = (): void => {
      const raw = Math.ceil(el.getBoundingClientRect().height);
      document.documentElement.style.setProperty(BOTTOM_NAV_CSS_VAR, `${Math.max(72, raw)}px`);
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
    if (!resolvedActive) {
      setIndicator(null);
      return undefined;
    }
    const rail = railRef.current;
    const activeEl = itemRefs.current[resolvedActive];
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
  }, [resolvedActive]);

  return (
    <nav ref={navRef} className="cq-dock-nav" aria-label="Main navigation">
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
          label="Home"
          active={resolvedActive === "quad"}
          onClick={() => onSelectTab("quad")}
          icon={
            <Home
              className="h-[22px] w-[22px]"
              strokeWidth={resolvedActive === "quad" ? 2.5 : 2}
              fill={resolvedActive === "quad" ? "currentColor" : "none"}
            />
          }
        />

        <DockItem
          ref={(node) => {
            itemRefs.current.realm = node;
          }}
          label="Map"
          active={resolvedActive === "realm"}
          onClick={() => onSelectTab("realm")}
          icon={<Map className="h-[22px] w-[22px]" strokeWidth={resolvedActive === "realm" ? 2.5 : 2} />}
        />

        <div className="cq-dock-nav__scan-slot">
          <button
            type="button"
            onClick={onOpenScanner}
            aria-label="Open CQ Scanner"
            className="cq-dock-nav__scan-btn cq-scanner-fab touch-manipulation"
          >
            <span className="cq-dock-nav__scan-ring" aria-hidden />
            <QrCode className="relative z-[1] h-7 w-7" strokeWidth={2.2} />
          </button>
        </div>

        <DockItem
          ref={(node) => {
            itemRefs.current.leaderboards = node;
          }}
          label="Ranks"
          active={resolvedActive === "leaderboards"}
          onClick={() => onSelectTab("leaderboards")}
          icon={
            <Trophy
              className="h-[22px] w-[22px]"
              strokeWidth={resolvedActive === "leaderboards" ? 2.5 : 2}
              fill={resolvedActive === "leaderboards" ? "currentColor" : "none"}
            />
          }
        />

        <DockProfileItem
          ref={(node) => {
            itemRefs.current.character = node;
          }}
          label="Profile"
          active={resolvedActive === "character"}
          onClick={() => onSelectTab("character")}
          avatar={liveAvatar}
          initials={profileInitials(characterName)}
          useInitials={shouldShowInitialsAvatar(liveAvatar)}
          loading={avatarLoading}
          showBadge={showBadge}
        />
      </div>
    </nav>
  );
}

const DockItem = forwardRef(function DockItem(
  {
    label,
    active,
    onClick,
    icon,
  }: {
    label: string;
    active: boolean;
    onClick: () => void;
    icon: ReactNode;
  },
  ref: ForwardedRef<HTMLButtonElement>,
) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      aria-label={label}
      className={`cq-dock-nav__item touch-manipulation ${active ? "cq-dock-nav__item--active" : ""}`}
    >
      <span className="cq-dock-nav__icon-wrap">{icon}</span>
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
    showBadge = false,
  }: {
    label: string;
    active: boolean;
    onClick: () => void;
    avatar?: unknown;
    initials: string;
    useInitials?: boolean;
    loading?: boolean;
    showBadge?: boolean;
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
      className={`cq-dock-nav__item cq-dock-nav__item--profile touch-manipulation ${active ? "cq-dock-nav__item--active" : ""}`}
    >
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
        {showBadge ? <span className="cq-dock-nav__badge cq-dock-nav__badge--avatar" aria-hidden /> : null}
      </span>
    </button>
  );
});
