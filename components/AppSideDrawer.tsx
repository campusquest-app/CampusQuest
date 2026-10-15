"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Bell,
  Building2,
  ChevronRight,
  HelpCircle,
  Landmark,
  Settings,
  Shield,
  Users,
} from "lucide-react";
import type { Character } from "@/lib/types";
import { DrawerPlayerProfileCard } from "@/components/DrawerPlayerProfileCard";
import { CampusQuestLogo } from "@/components/CampusQuestLogo";
import { AppSettingsPanel, type SettingsActionId } from "@/components/AppSettingsPanel";
import { settingsDestination } from "@/lib/client/settingsDestinations";
import { AccountSettingsPanel } from "@/components/settings/AccountSettingsPanel";
import { AppearanceSettingsPanel } from "@/components/settings/AppearanceSettingsPanel";
import { CampusSchoolSettingsPanel } from "@/components/settings/CampusSchoolSettingsPanel";
import { PrivacySupportSettingsPanel } from "@/components/settings/PrivacySupportSettingsPanel";
import { SoundHapticsSettingsPanel } from "@/components/settings/SoundHapticsSettingsPanel";
import { AppHelpSupportPanel } from "@/components/AppHelpSupportPanel";
import { BlockedUsersPanel } from "@/components/safety/BlockedUsersPanel";
import { TagsMentionsSettingsPanel } from "@/components/safety/TagsMentionsSettingsPanel";
import { PushNotificationsSettingsPanel } from "@/components/safety/PushNotificationsSettingsPanel";
import { DeleteAccountPanel } from "@/components/safety/DeleteAccountPanel";
import { DemographicsSettingsPanel } from "@/components/DemographicsSettingsPanel";
import { DRAWER_SNAP_MS } from "@/lib/client/drawerGeometry";
import { setIsDrawerOpen } from "@/lib/client/appDrawerStore";
import { allowStudentSurface } from "@/lib/featureFlags";
import { pulseHaptic } from "@/lib/client/hapticsPreference";
import { APP_VERSION } from "@/lib/appVersion";

export type AppDrawerDestination =
  | "friends"
  | "guilds"
  | "trending"
  | "quad"
  | "leaderboards"
  | "events"
  | "realm"
  | "organizations"
  | "greek-life"
  | "battle"
  | "inbox"
  | "character-sheet"
  | "profile"
  | "quest-board"
  | "help"
  | "manual-log"
  | "progress-hub"
  | "skills-lore";

type DrawerPanel =
  | "menu"
  | "settings"
  | "help"
  | "blocked-users"
  | "tags-mentions"
  | "push-notifications"
  | "delete-account"
  | "demographics"
  | "account"
  | "privacy"
  | "campus"
  | "appearance"
  | "sound";

type MenuItemId =
  | AppDrawerDestination
  | "mini-games"
  | "achievements"
  | "quest-board"
  | "settings"
  | "manual-log"
  | "progress-hub"
  | "skills-lore"
  | "collectibles"
  | "scan";

type MenuItem = {
  id: MenuItemId;
  label: string;
  icon: React.ReactNode;
};

type MenuSection = {
  id: string;
  title: string;
  items: MenuItem[];
};

const ICON = "h-[18px] w-[18px] shrink-0 stroke-[1.85]";

const DISCOVER_NAV: MenuItem[] = [
  { id: "friends", label: "Friends", icon: <Users className={ICON} aria-hidden /> },
  { id: "organizations", label: "Organizations", icon: <Building2 className={ICON} aria-hidden /> },
  { id: "greek-life", label: "Greek Life", icon: <Landmark className={ICON} aria-hidden /> },
];

const ACCOUNT_NAV: MenuItem[] = [
  { id: "settings", label: "Settings", icon: <Settings className={ICON} aria-hidden /> },
  { id: "inbox", label: "Notifications", icon: <Bell className={ICON} aria-hidden /> },
];

const UTILITY_NAV: MenuItem[] = [
  { id: "help", label: "Help & Support", icon: <HelpCircle className={ICON} aria-hidden /> },
];

const ADMIN_ICON = <Shield className={ICON} aria-hidden />;

function getDrawerMenuSections(): MenuSection[] {
  return [
    { id: "discover", title: "Discover", items: DISCOVER_NAV.filter((item) => allowStudentSurface(item.id)) },
    { id: "account", title: "Your Account", items: ACCOUNT_NAV.filter((item) => allowStudentSurface(item.id)) },
  ].filter((section) => section.items.length > 0);
}

const DRAWER_CLOSE_MS = 320;

export type DrawerActiveContext = {
  tab: string;
  quadFeedTab?: string;
  characterPane?: string;
  profileTab?: string;
};

function isMenuItemActive(id: MenuItemId, ctx: DrawerActiveContext): boolean {
  const { tab, quadFeedTab, characterPane, profileTab } = ctx;
  switch (id) {
    case "quad":
      return tab === "quad" && quadFeedTab !== "greek_life" && quadFeedTab !== "trending";
    case "trending":
      return tab === "quad" && quadFeedTab === "trending";
    case "greek-life":
      return tab === "quad" && quadFeedTab === "greek_life";
    case "realm":
      return tab === "realm";
    case "friends":
      return tab === "friends";
    case "guilds":
      return tab === "guilds";
    case "events":
      return tab === "events";
    case "leaderboards":
      return tab === "leaderboards";
    case "organizations":
      return tab === "organizations";
    case "progress-hub":
      return tab === "progress-hub";
    case "manual-log":
      return tab === "manual-log";
    case "skills-lore":
      return tab === "skills-lore";
    case "battle":
      return tab === "battle";
    case "mini-games":
      return tab === "mini-games";
    case "achievements":
      return tab === "achievements";
    case "quest-board":
      return tab === "quest-board";
    case "inbox":
      return tab === "inbox";
    case "profile":
      return tab === "character" && characterPane === "profile" && profileTab !== "collectibles";
    case "collectibles":
      return tab === "character" && characterPane === "profile" && profileTab === "collectibles";
    case "character-sheet":
      return tab === "character" && characterPane === "sheet";
    default:
      return false;
  }
}

export function AppSideDrawer({
  open,
  onClose,
  character,
  onNavigate,
  onSettingsAction,
  onRequestSignOut,
  onAccountDeleted,
  showAdminNav,
  unreadNotificationCount = 0,
  musicMuted,
  showXpProgressBar,
  xpProgressBarPrefLoaded,
  onToggleShowXpProgressBar,
  onMusicMutedChange,
  xpProgressBarSaveError,
  initialPanel = "menu",
  activeContext,
  drawerWidth = 360,
  drawerTranslateX = -360,
  isDraggingDrawer = false,
  drawerOpenProgress = 0,
}: {
  open: boolean;
  onClose: () => void;
  character: Character | null;
  onNavigate: (dest: MenuItemId) => void;
  onSettingsAction: (action: SettingsActionId) => void;
  onRequestSignOut?: () => void;
  /** Called after self-serve account deletion succeeds. */
  onAccountDeleted?: () => void;
  showAdminNav?: boolean;
  unreadNotificationCount?: number;
  musicMuted?: boolean;
  showXpProgressBar?: boolean;
  xpProgressBarPrefLoaded?: boolean;
  onToggleShowXpProgressBar?: (next: boolean) => void;
  onMusicMutedChange?: (muted: boolean) => void;
  xpProgressBarSaveError?: string | null;
  initialPanel?: DrawerPanel;
  activeContext?: DrawerActiveContext;
  drawerWidth?: number;
  drawerTranslateX?: number;
  isDraggingDrawer?: boolean;
  drawerOpenProgress?: number;
}) {
  const [panel, setPanel] = useState<DrawerPanel>("menu");
  const [mounted, setMounted] = useState(false);
  const [closing, setClosing] = useState(false);
  const [entered, setEntered] = useState(false);
  const [animateEntrance, setAnimateEntrance] = useState(false);
  const drawerRef = useRef<HTMLElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  // Swipe-opened drawers already show their content while dragging; replaying
  // the staggered entrance after release would flicker.
  const openedByDragRef = useRef(false);

  useEffect(() => {
    if (isDraggingDrawer) openedByDragRef.current = true;
  }, [isDraggingDrawer]);

  useEffect(() => {
    if (!open) return undefined;
    if (openedByDragRef.current) {
      openedByDragRef.current = false;
      return undefined;
    }
    setAnimateEntrance(true);
    const timer = window.setTimeout(() => setAnimateEntrance(false), 700);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (open || isDraggingDrawer) {
      setMounted(true);
      setClosing(false);
      return undefined;
    }
    if (!mounted) return undefined;
    setClosing(true);
    const timer = window.setTimeout(() => {
      setMounted(false);
      setClosing(false);
      setPanel("menu");
      openedByDragRef.current = false;
    }, DRAWER_CLOSE_MS);
    return () => window.clearTimeout(timer);
  }, [open, isDraggingDrawer, mounted]);

  useEffect(() => {
    if ((!open && !isDraggingDrawer) || !mounted) {
      setEntered(false);
      return undefined;
    }
    const frame = window.requestAnimationFrame(() => setEntered(true));
    return () => window.cancelAnimationFrame(frame);
  }, [open, isDraggingDrawer, mounted]);

  useEffect(() => {
    if (open) {
      setPanel(initialPanel);
    }
  }, [open, initialPanel]);

  useEffect(() => {
    if (!open && drawerOpenProgress < 0.02) return undefined;
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    const prevHtmlOverscroll = html.style.overscrollBehavior;
    const prevBodyOverscroll = body.style.overscrollBehavior;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    html.style.overscrollBehavior = "none";
    body.style.overscrollBehavior = "none";
    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
      html.style.overscrollBehavior = prevHtmlOverscroll;
      body.style.overscrollBehavior = prevBodyOverscroll;
    };
  }, [open, drawerOpenProgress]);

  useEffect(() => {
    if (open) {
      const active = document.activeElement;
      previousFocusRef.current = active instanceof HTMLElement ? active : null;
      const frame = window.requestAnimationFrame(() => {
        drawerRef.current?.focus({ preventScroll: true });
      });
      return () => window.cancelAnimationFrame(frame);
    }
    const restore = previousFocusRef.current;
    previousFocusRef.current = null;
    if (restore && document.contains(restore)) {
      restore.focus({ preventScroll: true });
    }
    return undefined;
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  // Block bottom nav + tab swipes while the drawer is visible (including open/close animations).
  useEffect(() => {
    const blocksNav = open || isDraggingDrawer || (mounted && closing);
    setIsDrawerOpen(blocksNav);
  }, [open, isDraggingDrawer, mounted, closing]);

  useEffect(() => () => setIsDrawerOpen(false), []);

  if (!mounted || typeof document === "undefined") return null;

  const isPanelOpen = entered && (open || isDraggingDrawer) && !closing;
  const backdropVisible = drawerOpenProgress > 0.01;
  const backdropInteractive = mounted && (backdropVisible || closing);
  const drawerSnapTransition = `transform ${DRAWER_SNAP_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`;
  const backdropSnapTransition = `opacity ${DRAWER_SNAP_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`;
  const panelPointerEvents = drawerTranslateX > -drawerWidth + 8 ? "auto" : "none";

  const handleItem = (id: MenuItemId) => {
    if (!allowStudentSurface(id)) return;
    pulseHaptic(8);
    if (id === "settings") {
      setPanel("settings");
      return;
    }
    if (id === "help") {
      setPanel("help");
      return;
    }
    onNavigate(id);
    onClose();
  };

  const ctx: DrawerActiveContext = activeContext ?? { tab: "" };
  const menuSections = getDrawerMenuSections();
  const utilityItems = UTILITY_NAV.filter((item) => allowStudentSurface(item.id));
  let staggerIndex = 0;
  const stagger = () => ({ "--cq-stagger": staggerIndex++ }) as React.CSSProperties;

  return createPortal(
    <>
      <button
        type="button"
        className="cq-drawer-backdrop fixed inset-0 z-[10050]"
        style={{
          opacity: drawerOpenProgress,
          pointerEvents: backdropInteractive ? "auto" : "none",
          transition: isDraggingDrawer ? "none" : backdropSnapTransition,
        }}
        aria-label="Close menu"
        aria-hidden={!backdropInteractive}
        tabIndex={backdropInteractive ? 0 : -1}
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
      />
      <aside
        ref={drawerRef}
        className={`cq-side-drawer flex flex-col ${isDraggingDrawer ? "cq-side-drawer--dragging" : ""} ${
          isPanelOpen && !isDraggingDrawer ? "cq-side-drawer--open" : ""
        }`}
        style={{
          paddingTop: "env(safe-area-inset-top, 0px)",
          paddingLeft: "env(safe-area-inset-left, 0px)",
          width: drawerWidth,
          transform: `translate3d(${drawerTranslateX}px, 0, 0)`,
          transition: isDraggingDrawer ? "none" : drawerSnapTransition,
          pointerEvents: panelPointerEvents,
        }}
        tabIndex={-1}
        role="dialog"
        aria-modal={isPanelOpen ? true : undefined}
        aria-label="CampusQuest menu"
        aria-hidden={!isPanelOpen}
        inert={isPanelOpen ? undefined : true}
      >
        <div className="cq-drawer-body flex min-h-0 flex-1 flex-col">
          {panel === "menu" ? (
            <div className={`flex min-h-0 flex-1 flex-col ${animateEntrance ? "cq-drawer-menu--enter" : ""}`}>
              <div className="cq-drawer-profile-sticky cq-drawer-stagger shrink-0" style={stagger()}>
                {character ? (
                  <DrawerPlayerProfileCard
                    character={character}
                    menuOpen={open || isDraggingDrawer}
                    onOpenProfile={() => handleItem("profile")}
                  />
                ) : (
                  <div className="px-5 py-4">
                    <CampusQuestLogo variant="drawer" />
                    <p className="mt-2 text-xs text-white/45">Your campus, connected</p>
                  </div>
                )}
              </div>

              <nav className="cq-drawer-nav min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 pb-5" aria-label="Main">
                {menuSections.map((section) => (
                  <DrawerSection
                    key={section.id}
                    title={section.title}
                    items={section.items}
                    onSelect={handleItem}
                    badgeId="inbox"
                    unread={unreadNotificationCount}
                    activeContext={ctx}
                    style={stagger()}
                  />
                ))}
                {showAdminNav ? (
                  <section className="cq-drawer-section cq-drawer-stagger" style={stagger()}>
                    <h2 className="cq-drawer-section-label">Administration</h2>
                    <ul className="cq-drawer-section-list">
                      <li>
                        <Link
                          href="/internal/admin"
                          onClick={() => {
                            pulseHaptic(8);
                            onClose();
                          }}
                          className={DRAWER_ROW_CLASS}
                        >
                          <DrawerRowContent icon={ADMIN_ICON} label="Admin Tools" />
                        </Link>
                      </li>
                    </ul>
                  </section>
                ) : null}
              </nav>

              <div
                className="cq-drawer-footer cq-drawer-stagger shrink-0 px-4 pt-2"
                style={{ ...stagger(), paddingBottom: "max(0.625rem, env(safe-area-inset-bottom))" }}
              >
                {utilityItems.length > 0 ? (
                  <ul className="cq-drawer-section-list" aria-label="Support">
                    {utilityItems.map((item) => (
                      <li key={item.id}>
                        <button type="button" onClick={() => handleItem(item.id)} className={DRAWER_ROW_CLASS}>
                          <DrawerRowContent icon={item.icon} label={item.label} />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <p className="cq-drawer-brand">
                  <CampusQuestLogo variant="mark" />
                  <span>CampusQuest</span>
                  <span aria-hidden>·</span>
                  <span>Version {APP_VERSION}</span>
                </p>
              </div>
            </div>
          ) : panel === "settings" ? (
            <AppSettingsPanel
              onBack={() => setPanel("menu")}
              onRequestSignOut={onRequestSignOut}
              onAction={(action) => {
                const destination = settingsDestination(action);
                if (destination.kind === "drawer") {
                  setPanel(destination.panel);
                  return;
                }
                if (destination.kind === "sign-out") {
                  onRequestSignOut?.();
                  return;
                }
                onSettingsAction(action);
                onClose();
              }}
              musicMuted={musicMuted}
              showXpProgressBar={showXpProgressBar}
              xpProgressBarPrefLoaded={xpProgressBarPrefLoaded}
              onToggleShowXpProgressBar={onToggleShowXpProgressBar}
              xpProgressBarSaveError={xpProgressBarSaveError}
            />
          ) : panel === "blocked-users" ? (
            <BlockedUsersPanel onBack={() => setPanel("settings")} />
          ) : panel === "tags-mentions" ? (
            <TagsMentionsSettingsPanel onBack={() => setPanel("settings")} />
          ) : panel === "push-notifications" ? (
            <PushNotificationsSettingsPanel onBack={() => setPanel("settings")} />
          ) : panel === "delete-account" ? (
            <DeleteAccountPanel
              onBack={() => setPanel("settings")}
              onDeleted={() => {
                onClose();
                onAccountDeleted?.();
              }}
            />
          ) : panel === "demographics" ? (
            <DemographicsSettingsPanel
              onBack={() => {
                if (initialPanel === "demographics") {
                  onClose();
                  return;
                }
                setPanel("settings");
              }}
            />
          ) : panel === "account" ? (
            <AccountSettingsPanel onBack={() => setPanel("settings")} />
          ) : panel === "privacy" ? (
            <PrivacySupportSettingsPanel onBack={() => setPanel("settings")} />
          ) : panel === "campus" ? (
            <CampusSchoolSettingsPanel onBack={() => setPanel("settings")} />
          ) : panel === "appearance" ? (
            <AppearanceSettingsPanel onBack={() => setPanel("settings")} />
          ) : panel === "sound" ? (
            <SoundHapticsSettingsPanel
              onBack={() => setPanel("settings")}
              onMutedChange={onMusicMutedChange}
            />
          ) : (
            <AppHelpSupportPanel onBack={() => setPanel("menu")} />
          )}
        </div>
      </aside>
    </>,
    document.body,
  );
}

const DRAWER_ROW_CLASS =
  "cq-drawer-item group flex w-full min-h-[44px] items-center gap-3 px-3 text-left touch-manipulation";

function DrawerRowContent({
  icon,
  label,
  active = false,
  badge = 0,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  badge?: number;
}) {
  return (
    <>
      <span className={`cq-drawer-item-icon ${active ? "cq-drawer-item-icon--active" : ""}`}>{icon}</span>
      <span className={`cq-drawer-item-label flex-1 truncate ${active ? "cq-drawer-item-label--active" : ""}`}>
        {label}
      </span>
      {badge > 0 ? (
        <span className="cq-drawer-item-badge" aria-label={`${badge} unread`}>
          {Math.min(99, badge)}
        </span>
      ) : null}
      <ChevronRight className="cq-drawer-item-chevron h-4 w-4 shrink-0" aria-hidden />
    </>
  );
}

function DrawerSection({
  title,
  items,
  onSelect,
  badgeId,
  unread = 0,
  activeContext,
  style,
}: {
  title: string;
  items: MenuItem[];
  onSelect: (id: MenuItemId) => void;
  badgeId?: string;
  unread?: number;
  activeContext: DrawerActiveContext;
  style?: React.CSSProperties;
}) {
  return (
    <section className="cq-drawer-section cq-drawer-stagger" style={style}>
      <h2 className="cq-drawer-section-label">{title}</h2>
      <ul className="cq-drawer-section-list">
        {items.map((item) => {
          const active = isMenuItemActive(item.id, activeContext);
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onSelect(item.id)}
                className={`${DRAWER_ROW_CLASS} ${active ? "cq-drawer-item--active" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                <DrawerRowContent
                  icon={item.icon}
                  label={item.label}
                  active={active}
                  badge={badgeId === item.id ? unread : 0}
                />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
