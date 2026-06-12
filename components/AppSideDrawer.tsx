"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  BookOpen,
  ClipboardPen,
  Building2,
  Calendar,
  ChevronRight,
  Compass,
  Gamepad2,
  HelpCircle,
  Home,
  Inbox,
  Map,
  Medal,
  ScrollText,
  Settings,
  Shield,
  Sparkles,
  Swords,
  Target,
  TrendingUp,
  Trophy,
  UserCircle,
  Users,
} from "lucide-react";
import type { Character } from "@/lib/types";
import { DrawerPlayerProfileCard } from "@/components/DrawerPlayerProfileCard";
import { CampusQuestLogo } from "@/components/CampusQuestLogo";
import { AppSettingsPanel, type SettingsActionId } from "@/components/AppSettingsPanel";
import { AppHelpSupportPanel } from "@/components/AppHelpSupportPanel";
import { DRAWER_SNAP_MS } from "@/lib/client/drawerGeometry";

export type AppDrawerDestination =
  | "friends"
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

type DrawerPanel = "menu" | "settings" | "help";

type MenuItemId =
  | AppDrawerDestination
  | "guilds"
  | "mini-games"
  | "achievements"
  | "quest-board"
  | "settings"
  | "manual-log"
  | "progress-hub"
  | "skills-lore";

type MenuItem = {
  id: MenuItemId;
  label: string;
  icon: React.ReactNode;
  description?: string;
  tier?: "core" | "default";
};

type MenuSection = {
  id: string;
  title: string;
  icon: React.ReactNode;
  items: MenuItem[];
};

const CORE: MenuItem[] = [
  { id: "realm", label: "The Realm", icon: <Map className="h-5 w-5" />, tier: "core" },
  { id: "quad", label: "Quad", icon: <Home className="h-5 w-5" />, tier: "core" },
  { id: "friends", label: "Friends", icon: <Users className="h-5 w-5" />, tier: "core" },
  { id: "events", label: "Events", icon: <Calendar className="h-5 w-5" />, tier: "core" },
  { id: "leaderboards", label: "Leaderboard", icon: <Trophy className="h-5 w-5" />, tier: "core" },
];

const COMMUNITY: MenuItem[] = [
  { id: "organizations", label: "Orgs", icon: <Building2 className="h-5 w-5" />, description: "Campus organizations" },
];

const PROGRESS: MenuItem[] = [
  {
    id: "progress-hub",
    label: "My Progress",
    icon: <TrendingUp className="h-5 w-5" />,
    description: "Streaks, recap & activity",
  },
  {
    id: "manual-log",
    label: "Manual Log",
    icon: <ClipboardPen className="h-5 w-5" />,
    description: "Log activities for XP",
  },
  {
    id: "skills-lore",
    label: "Skills & Lore",
    icon: <ScrollText className="h-5 w-5" />,
    description: "Skill tree & lore archive",
  },
  {
    id: "guilds",
    label: "Guilds",
    icon: <Shield className="h-5 w-5" />,
    description: "Team up for bonus XP",
  },
];

const GAME_MODES: MenuItem[] = [
  { id: "battle", label: "Boss Battle", icon: <Swords className="h-5 w-5" /> },
  { id: "mini-games", label: "Mini Games", icon: <Gamepad2 className="h-5 w-5" /> },
  { id: "achievements", label: "Hall of Legends", icon: <Medal className="h-5 w-5" /> },
  {
    id: "quest-board",
    label: "Quest Board",
    icon: <Target className="h-5 w-5" />,
    description: "Daily & tracked quests",
  },
];

const ACCOUNT: MenuItem[] = [
  { id: "inbox", label: "Inbox", icon: <Inbox className="h-5 w-5" /> },
  { id: "settings", label: "Settings", icon: <Settings className="h-5 w-5" /> },
  { id: "help", label: "Help & Support", icon: <HelpCircle className="h-5 w-5" /> },
];

const MENU_SECTIONS: MenuSection[] = [
  { id: "core", title: "Core", icon: <Compass className="h-3 w-3" />, items: CORE },
  { id: "community", title: "Community", icon: <Building2 className="h-3 w-3" />, items: COMMUNITY },
  { id: "progress", title: "Progress", icon: <Sparkles className="h-3 w-3" />, items: PROGRESS },
  { id: "game-modes", title: "Game Modes", icon: <Swords className="h-3 w-3" />, items: GAME_MODES },
  { id: "account", title: "Account", icon: <UserCircle className="h-3 w-3" />, items: ACCOUNT },
];

const DRAWER_CLOSE_MS = 320;

export type DrawerActiveContext = {
  tab: string;
  quadFeedTab?: string;
};

function isMenuItemActive(id: MenuItemId, ctx: DrawerActiveContext): boolean {
  const { tab, quadFeedTab } = ctx;
  switch (id) {
    case "quad":
      return tab === "quad";
    case "trending":
      return tab === "quad" && quadFeedTab === "trending";
    case "realm":
      return tab === "realm";
    case "friends":
    case "guilds":
      return tab === "friends";
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
  showAdminNav,
  unreadNotificationCount = 0,
  musicMuted,
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
  showAdminNav?: boolean;
  unreadNotificationCount?: number;
  musicMuted?: boolean;
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

  if (!mounted || typeof document === "undefined") return null;

  const isPanelOpen = entered && (open || isDraggingDrawer) && !closing;
  const backdropVisible = drawerOpenProgress > 0.01;
  const backdropInteractive = backdropVisible && !closing;
  const drawerSnapTransition = `transform ${DRAWER_SNAP_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`;
  const backdropSnapTransition = `opacity ${DRAWER_SNAP_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`;
  const panelPointerEvents = drawerTranslateX > -drawerWidth + 8 ? "auto" : "none";

  const handleItem = (id: MenuItemId) => {
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
        className="cq-drawer-backdrop fixed inset-0 z-[1000]"
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
        <div className="cq-drawer-parallax" aria-hidden />
        <div className="cq-drawer-glass" aria-hidden />
        <div className="cq-drawer-body flex min-h-0 flex-1 flex-col">
        {panel === "menu" ? (
          <>
            <div className="cq-drawer-profile-sticky shrink-0 border-b border-white/[0.08]">
              {character ? (
                <DrawerPlayerProfileCard
                  character={character}
                  onOpenProfile={() => handleItem("profile")}
                />
              ) : (
                <div className="px-5 py-4">
                  <CampusQuestLogo variant="drawer" />
                  <p className="mt-2 text-xs text-white/45">Level up your campus life</p>
                </div>
              )}
            </div>

            <nav className="cq-drawer-nav flex-1 overflow-y-auto overscroll-y-contain px-2.5 pb-3 pt-2">
              {MENU_SECTIONS.map((section, sectionIndex) => (
                <DrawerSection
                  key={section.id}
                  title={section.title}
                  icon={section.icon}
                  items={section.items}
                  onSelect={handleItem}
                  badgeId="inbox"
                  unread={unreadNotificationCount}
                  activeContext={ctx}
                  sectionIndex={sectionIndex}
                />
              ))}
            </nav>

            <div
              className="cq-drawer-footer shrink-0 border-t border-white/[0.05] px-4 py-2"
              style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
            >
              {showAdminNav ? (
                <Link
                  href="/internal/admin"
                  onClick={onClose}
                  className="mb-2 flex min-h-[40px] items-center gap-3 rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/15"
                >
                  <BookOpen className="h-4 w-4" />
                  Admin tools
                </Link>
              ) : null}
              <p className="cq-drawer-version text-center">CampusQuest v0.1</p>
            </div>
          </>
        ) : panel === "settings" ? (
          <AppSettingsPanel
            onBack={() => setPanel("menu")}
            onRequestSignOut={onRequestSignOut}
            onAction={(action) => {
              onSettingsAction(action);
              if (action !== "sound" && action !== "appearance") {
                onClose();
              }
            }}
            musicMuted={musicMuted}
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

function DrawerSection({
  title,
  icon,
  items,
  onSelect,
  badgeId,
  unread = 0,
  activeContext,
  sectionIndex,
}: {
  title: string;
  icon: React.ReactNode;
  items: MenuItem[];
  onSelect: (id: MenuItemId) => void;
  badgeId?: string;
  unread?: number;
  activeContext: DrawerActiveContext;
  sectionIndex: number;
}) {
  return (
    <div className="cq-drawer-section mb-3.5">
      <div className="cq-drawer-section-header mb-1.5 flex items-center gap-2 px-2">
        <span className="cq-drawer-section-icon flex h-4 w-4 items-center justify-center">{icon}</span>
        <p className="cq-drawer-section-label flex-1 text-[10px] font-bold uppercase tracking-[0.18em]">
          {title}
        </p>
        <span className="cq-drawer-section-rule h-px flex-1 bg-gradient-to-r from-cyan-400/20 to-transparent" aria-hidden />
      </div>
      <ul className="space-y-0.5">
        {items.map((item, itemIndex) => {
          const active = isMenuItemActive(item.id, activeContext);
          const staggerIndex = sectionIndex * 10 + itemIndex;
          return (
            <li
              key={item.id}
              className="cq-drawer-item-enter"
              style={{ animationDelay: `${48 + staggerIndex * 24}ms` }}
            >
              <button
                type="button"
                onClick={() => onSelect(item.id)}
                className={`cq-drawer-item group flex w-full min-h-[44px] items-center gap-2.5 rounded-xl px-2.5 py-2 text-left touch-manipulation ${
                  active ? "cq-drawer-item--active" : ""
                } ${item.tier === "core" ? "cq-drawer-item--core" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                <span
                  className={`cq-drawer-item-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${
                    active ? "cq-drawer-item-icon--active" : ""
                  }`}
                >
                  {item.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={`cq-drawer-item-label flex items-center gap-2 leading-tight ${
                      item.tier === "core" ? "cq-drawer-item-label--core" : ""
                    } ${active ? "cq-drawer-item-label--active" : ""}`}
                  >
                    {item.label}
                  </span>
                  {item.description ? (
                    <span className="cq-drawer-item-desc block truncate">{item.description}</span>
                  ) : null}
                </span>
                {badgeId === item.id && unread > 0 ? (
                  <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-bold text-white">
                    {Math.min(99, unread)}
                  </span>
                ) : item.id === "settings" || item.id === "help" ? (
                  <ChevronRight className="h-4 w-4 shrink-0 text-white/22 transition group-hover:text-white/42" />
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
