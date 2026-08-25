"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  Bell,
  BookOpen,
  Building2,
  Calendar,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Gamepad2,
  HelpCircle,
  Home,
  Map,
  QrCode,
  Settings,
  Shield,
  Sparkles,
  Swords,
  Target,
  Trophy,
  User,
  Users,
} from "lucide-react";
import type { Character } from "@/lib/types";
import { DrawerPlayerProfileCard } from "@/components/DrawerPlayerProfileCard";
import { CampusQuestLogo } from "@/components/CampusQuestLogo";
import { AppSettingsPanel, type SettingsActionId } from "@/components/AppSettingsPanel";
import { AppHelpSupportPanel } from "@/components/AppHelpSupportPanel";
import { BlockedUsersPanel } from "@/components/safety/BlockedUsersPanel";
import { TagsMentionsSettingsPanel } from "@/components/safety/TagsMentionsSettingsPanel";
import { PushNotificationsSettingsPanel } from "@/components/safety/PushNotificationsSettingsPanel";
import { DeleteAccountPanel } from "@/components/safety/DeleteAccountPanel";
import { DemographicsSettingsPanel } from "@/components/DemographicsSettingsPanel";
import { DRAWER_SNAP_MS } from "@/lib/client/drawerGeometry";
import { setIsDrawerOpen } from "@/lib/client/appDrawerStore";
import { FEATURE_FLAGS } from "@/lib/featureFlags";

export type AppDrawerDestination =
  | "friends"
  | "guilds"
  | "trending"
  | "quad"
  | "leaderboards"
  | "events"
  | "realm"
  | "organizations"
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
  | "demographics";

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

const ICON = "h-[1.125rem] w-[1.125rem] shrink-0 stroke-[1.75]";

const MAIN_NAV: MenuItem[] = [
  { id: "quad", label: "Quad", icon: <Home className={ICON} aria-hidden /> },
  { id: "realm", label: "Map", icon: <Map className={ICON} aria-hidden /> },
  { id: "friends", label: "Friends", icon: <Users className={ICON} aria-hidden /> },
  { id: "guilds", label: "Guilds", icon: <Shield className={ICON} aria-hidden /> },
  { id: "profile", label: "Profile", icon: <User className={ICON} aria-hidden /> },
];

const PROGRESS_NAV: MenuItem[] = [
  { id: "scan", label: "CQ Scanner", icon: <QrCode className={ICON} aria-hidden /> },
  { id: "character-sheet", label: "Character", icon: <Sparkles className={ICON} aria-hidden /> },
  { id: "leaderboards", label: "Leaderboard", icon: <Trophy className={ICON} aria-hidden /> },
  // Manual Log entry is gated by FEATURE_FLAGS.manualLog in getProgressNav().
  { id: "manual-log", label: "Manual Log", icon: <ClipboardList className={ICON} aria-hidden /> },
  { id: "quest-board", label: "Quests", icon: <Target className={ICON} aria-hidden /> },
];

const MINI_GAMES_NAV: MenuItem[] = [
  // Boss Battle entry is gated by FEATURE_FLAGS.bossBattles in getMiniGamesNav().
  { id: "battle", label: "Boss Battle", icon: <Swords className={ICON} aria-hidden /> },
  { id: "mini-games", label: "Training Grounds", icon: <Gamepad2 className={ICON} aria-hidden /> },
];

const CAMPUS_NAV: MenuItem[] = [
  { id: "events", label: "Events", icon: <Calendar className={ICON} aria-hidden /> },
  { id: "organizations", label: "Organizations", icon: <Building2 className={ICON} aria-hidden /> },
];

const SETTINGS_NAV: MenuItem[] = [
  { id: "settings", label: "Account", icon: <Settings className={ICON} aria-hidden /> },
  { id: "inbox", label: "Notifications", icon: <Bell className={ICON} aria-hidden /> },
  { id: "help", label: "Help / Support", icon: <HelpCircle className={ICON} aria-hidden /> },
];

function getProgressNav(): MenuItem[] {
  return PROGRESS_NAV.filter((item) => item.id !== "manual-log" || FEATURE_FLAGS.manualLog);
}

function getMiniGamesNav(): MenuItem[] {
  return MINI_GAMES_NAV.filter((item) => item.id !== "battle" || FEATURE_FLAGS.bossBattles);
}

function getFlatMenuSections(): MenuSection[] {
  const progressItems = getProgressNav();
  return [
    { id: "main", title: "Main", items: MAIN_NAV },
    ...(progressItems.length > 0 ? [{ id: "progress", title: "Progress", items: progressItems }] : []),
    { id: "campus", title: "Campus", items: CAMPUS_NAV },
    { id: "settings", title: "Settings", items: SETTINGS_NAV },
  ];
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
      return tab === "quad";
    case "trending":
      return tab === "quad" && quadFeedTab === "trending";
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
  const [miniGamesExpanded, setMiniGamesExpanded] = useState(false);

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
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, drawerOpenProgress]);

  useEffect(() => {
    if (!open) return undefined;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
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

  useEffect(() => {
    if (!open) return;
    const tab = activeContext?.tab ?? "";
    if (tab === "battle" || tab === "mini-games") {
      setMiniGamesExpanded(true);
    }
  }, [open, activeContext?.tab]);

  if (!mounted || typeof document === "undefined") return null;

  const isPanelOpen = entered && (open || isDraggingDrawer) && !closing;
  const backdropVisible = drawerOpenProgress > 0.01;
  const backdropInteractive = backdropVisible && !closing;
  const drawerSnapTransition = `transform ${DRAWER_SNAP_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`;
  const backdropSnapTransition = `opacity ${DRAWER_SNAP_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`;
  const panelPointerEvents = drawerTranslateX > -drawerWidth + 8 ? "auto" : "none";

  const handleItem = (id: MenuItemId) => {
    if (id === "manual-log" && !FEATURE_FLAGS.manualLog) return;
    if (id === "battle" && !FEATURE_FLAGS.bossBattles) return;
    if (id === "collectibles" && !FEATURE_FLAGS.codex) return;
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
        onClick={onClose}
      />
      <aside
        className={`cq-side-drawer flex flex-col ${isDraggingDrawer ? "cq-side-drawer--dragging" : ""} ${
          isPanelOpen && !isDraggingDrawer ? "cq-side-drawer--open" : ""
        }`}
        style={{
          paddingTop: "env(safe-area-inset-top, 0px)",
          width: drawerWidth,
          transform: `translate3d(${drawerTranslateX}px, 0, 0)`,
          transition: isDraggingDrawer ? "none" : drawerSnapTransition,
          pointerEvents: panelPointerEvents,
        }}
        aria-label="CampusQuest menu"
        aria-hidden={!isPanelOpen}
        inert={isPanelOpen ? undefined : true}
      >
        <div className="cq-drawer-body flex min-h-0 flex-1 flex-col">
          {panel === "menu" ? (
            <>
              <div className="cq-drawer-profile-sticky shrink-0">
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

              <nav className="cq-drawer-nav flex-1 overflow-y-auto overscroll-y-contain px-3 pb-4" aria-label="Main">
                {(() => {
                  const sections = getFlatMenuSections();
                  const mainAndProgress = sections.filter((s) => s.id === "main" || s.id === "progress");
                  const rest = sections.filter((s) => s.id !== "main" && s.id !== "progress");
                  const miniGamesItems = getMiniGamesNav();
                  return (
                    <>
                      {mainAndProgress.map((section, sectionIndex) => (
                        <DrawerSection
                          key={section.id}
                          title={section.title}
                          items={section.items}
                          onSelect={handleItem}
                          activeContext={ctx}
                          isFirst={sectionIndex === 0}
                        />
                      ))}
                      {miniGamesItems.length > 0 ? (
                        <DrawerCollapsibleSection
                          title="Mini Games"
                          items={miniGamesItems}
                          expanded={miniGamesExpanded}
                          onToggle={() => setMiniGamesExpanded((open) => !open)}
                          onSelect={handleItem}
                          activeContext={ctx}
                        />
                      ) : null}
                      {rest.map((section) => (
                        <DrawerSection
                          key={section.id}
                          title={section.title}
                          items={section.items}
                          onSelect={handleItem}
                          badgeId="inbox"
                          unread={unreadNotificationCount}
                          activeContext={ctx}
                        />
                      ))}
                    </>
                  );
                })()}
              </nav>

              <div
                className="cq-drawer-footer shrink-0 px-4 py-2"
                style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
              >
                {showAdminNav ? (
                  <Link
                    href="/internal/admin"
                    onClick={onClose}
                    className="mb-2 flex min-h-[40px] items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-white/75 transition hover:bg-white/[0.06] hover:text-white"
                  >
                    <BookOpen className="h-4 w-4" aria-hidden />
                    Admin tools
                  </Link>
                ) : null}
                <p className="cq-drawer-version text-center">CampusQuest</p>
              </div>
            </>
          ) : panel === "settings" ? (
            <AppSettingsPanel
              onBack={() => setPanel("menu")}
              onRequestSignOut={onRequestSignOut}
              onAction={(action) => {
                if (action === "blocked-users") {
                  setPanel("blocked-users");
                  return;
                }
                if (action === "tags-mentions") {
                  setPanel("tags-mentions");
                  return;
                }
                if (action === "push-notifications") {
                  setPanel("push-notifications");
                  return;
                }
                if (action === "delete-account") {
                  setPanel("delete-account");
                  return;
                }
                if (action === "demographics") {
                  setPanel("demographics");
                  return;
                }
                onSettingsAction(action);
                if (action !== "sound" && action !== "appearance") {
                  onClose();
                }
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
            <DemographicsSettingsPanel onBack={() => setPanel("settings")} />
          ) : (
            <AppHelpSupportPanel onBack={() => setPanel("menu")} />
          )}
        </div>
      </aside>
    </>,
    document.body,
  );
}

function DrawerCollapsibleSection({
  title,
  items,
  expanded,
  onToggle,
  onSelect,
  activeContext,
}: {
  title: string;
  items: MenuItem[];
  expanded: boolean;
  onToggle: () => void;
  onSelect: (id: MenuItemId) => void;
  activeContext: DrawerActiveContext;
}) {
  const childActive = items.some((item) => isMenuItemActive(item.id, activeContext));

  return (
    <section className="cq-drawer-section">
      <button
        type="button"
        onClick={onToggle}
        className={`cq-drawer-item group flex w-full min-h-[44px] items-center gap-3 rounded-lg px-2 py-2.5 text-left touch-manipulation ${
          childActive ? "cq-drawer-item--active" : ""
        }`}
        aria-expanded={expanded}
      >
        <span className={`cq-drawer-item-icon ${childActive ? "cq-drawer-item-icon--active" : ""}`}>
          <Gamepad2 className={ICON} aria-hidden />
        </span>
        <span className={`cq-drawer-item-label flex-1 ${childActive ? "cq-drawer-item-label--active" : ""}`}>
          {title}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-white/25 transition group-hover:text-white/45 ${
            expanded ? "rotate-180" : ""
          }`}
          aria-hidden
        />
      </button>
      {expanded ? (
        <ul className="cq-drawer-section-list ml-2 border-l border-white/10 pl-2">
          {items.map((item) => {
            const active = isMenuItemActive(item.id, activeContext);
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onSelect(item.id)}
                  className={`cq-drawer-item group flex w-full min-h-[40px] items-center gap-3 rounded-lg px-2 py-2 text-left touch-manipulation ${
                    active ? "cq-drawer-item--active" : ""
                  }`}
                  aria-current={active ? "page" : undefined}
                >
                  <span className={`cq-drawer-item-icon ${active ? "cq-drawer-item-icon--active" : ""}`}>
                    {item.icon}
                  </span>
                  <span className={`cq-drawer-item-label flex-1 text-sm ${active ? "cq-drawer-item-label--active" : ""}`}>
                    {item.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}

function DrawerSection({
  title,
  items,
  onSelect,
  badgeId,
  unread = 0,
  activeContext,
  isFirst = false,
}: {
  title: string;
  items: MenuItem[];
  onSelect: (id: MenuItemId) => void;
  badgeId?: string;
  unread?: number;
  activeContext: DrawerActiveContext;
  isFirst?: boolean;
}) {
  return (
    <section className={`cq-drawer-section ${isFirst ? "cq-drawer-section--first" : ""}`}>
      <h2 className="cq-drawer-section-label">{title}</h2>
      <ul className="cq-drawer-section-list">
        {items.map((item) => {
          const active = isMenuItemActive(item.id, activeContext);
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onSelect(item.id)}
                className={`cq-drawer-item group flex w-full min-h-[44px] items-center gap-3 rounded-lg px-2 py-2.5 text-left touch-manipulation ${
                  active ? "cq-drawer-item--active" : ""
                }`}
                aria-current={active ? "page" : undefined}
              >
                <span className={`cq-drawer-item-icon ${active ? "cq-drawer-item-icon--active" : ""}`}>{item.icon}</span>
                <span className={`cq-drawer-item-label flex-1 ${active ? "cq-drawer-item-label--active" : ""}`}>
                  {item.label}
                </span>
                {badgeId === item.id && unread > 0 ? (
                  <span className="cq-drawer-item-badge">{Math.min(99, unread)}</span>
                ) : item.id === "settings" || item.id === "help" ? (
                  <ChevronRight className="h-4 w-4 shrink-0 text-white/25 transition group-hover:text-white/45" aria-hidden />
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
