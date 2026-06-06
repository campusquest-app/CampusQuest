"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  BookOpen,
  Building2,
  Calendar,
  ChevronRight,
  Gamepad2,
  HelpCircle,
  Inbox,
  Map,
  Medal,
  MessageCircle,
  Settings,
  Shield,
  Sparkles,
  Swords,
  Target,
  TrendingUp,
  Trophy,
  Users,
} from "lucide-react";
import type { Character } from "@/lib/types";
import { DrawerPlayerProfileCard } from "@/components/DrawerPlayerProfileCard";
import { AppSettingsPanel, type SettingsActionId } from "@/components/AppSettingsPanel";
import { AppHelpSupportPanel } from "@/components/AppHelpSupportPanel";

export type AppDrawerDestination =
  | "friends"
  | "trending"
  | "leaderboards"
  | "events"
  | "realm"
  | "organizations"
  | "battle"
  | "inbox"
  | "character-sheet"
  | "profile"
  | "daily-quests"
  | "special-quests"
  | "help";

type DrawerPanel = "menu" | "settings" | "help";

type MenuItem = {
  id: AppDrawerDestination | "guilds" | "mini-games" | "achievements" | "settings";
  label: string;
  icon: React.ReactNode;
  description?: string;
};

const EXPLORE: MenuItem[] = [
  { id: "friends", label: "Friends", icon: <Users className="h-5 w-5" />, description: "Connect with Rams" },
  { id: "trending", label: "Trending", icon: <TrendingUp className="h-5 w-5" />, description: "Hot campus posts" },
  { id: "leaderboards", label: "Leaderboard", icon: <Trophy className="h-5 w-5" /> },
  { id: "events", label: "Events", icon: <Calendar className="h-5 w-5" /> },
  { id: "realm", label: "The Realm", icon: <Map className="h-5 w-5" />, description: "URI quest map" },
  { id: "organizations", label: "Orgs", icon: <Building2 className="h-5 w-5" /> },
  { id: "guilds", label: "Guilds", icon: <Shield className="h-5 w-5" />, description: "Team up for bonus XP" },
  { id: "battle", label: "Boss Battle", icon: <Swords className="h-5 w-5" /> },
];

const PROGRESS: MenuItem[] = [
  { id: "daily-quests", label: "Quests", icon: <Target className="h-5 w-5" /> },
  { id: "special-quests", label: "Special Quests", icon: <Sparkles className="h-5 w-5" /> },
  { id: "mini-games", label: "Mini Games", icon: <Gamepad2 className="h-5 w-5" /> },
  { id: "achievements", label: "Achievements", icon: <Medal className="h-5 w-5" /> },
];

const SUPPORT: MenuItem[] = [
  { id: "inbox", label: "Inbox", icon: <Inbox className="h-5 w-5" /> },
  { id: "settings", label: "Settings", icon: <Settings className="h-5 w-5" /> },
  { id: "help", label: "Help & Support", icon: <HelpCircle className="h-5 w-5" /> },
];

export function AppSideDrawer({
  open,
  onClose,
  character,
  onNavigate,
  onSettingsAction,
  showAdminNav,
  unreadNotificationCount = 0,
  musicMuted,
  initialPanel = "menu",
}: {
  open: boolean;
  onClose: () => void;
  character: Character | null;
  onNavigate: (dest: AppDrawerDestination | "guilds" | "mini-games" | "achievements" | "settings") => void;
  onSettingsAction: (action: SettingsActionId) => void;
  showAdminNav?: boolean;
  unreadNotificationCount?: number;
  musicMuted?: boolean;
  initialPanel?: DrawerPanel;
}) {
  const [panel, setPanel] = useState<DrawerPanel>("menu");

  useEffect(() => {
    if (open) {
      setPanel(initialPanel);
    } else {
      setPanel("menu");
    }
  }, [open, initialPanel]);

  if (!open || typeof document === "undefined") return null;

  const handleItem = (id: MenuItem["id"]) => {
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

  return createPortal(
    <>
      <button
        type="button"
        className="cq-drawer-backdrop fixed inset-0 z-[90] bg-black/55 backdrop-blur-[2px]"
        aria-label="Close menu"
        onClick={onClose}
      />
      <aside
        className="cq-side-drawer fixed inset-y-0 left-0 z-[91] flex w-[min(18.5rem,88vw)] flex-col border-r border-[rgba(100,180,255,0.15)] bg-cq-secondary/98 shadow-[8px_0_40px_-8px_rgba(0,0,0,0.55)] backdrop-blur-xl"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
        aria-label="CampusQuest menu"
      >
        {panel === "menu" ? (
          <>
            {character ? (
              <DrawerPlayerProfileCard
                character={character}
                onOpenProfile={() => handleItem("profile")}
              />
            ) : (
              <div className="border-b border-white/[0.06] px-5 py-5">
                <p className="font-display text-sm font-bold tracking-[0.18em] text-white">CAMPUSQUEST</p>
                <p className="mt-1 text-xs text-white/45">Level up your campus life</p>
              </div>
            )}

            <nav className="flex-1 overflow-y-auto px-3 pb-4 pt-1">
              <DrawerSection title="Explore" items={EXPLORE} onSelect={handleItem} />
              <DrawerSection title="Progress" items={PROGRESS} onSelect={handleItem} />
              <DrawerSection
                title="Account"
                items={SUPPORT}
                onSelect={handleItem}
                badgeId="inbox"
                unread={unreadNotificationCount}
              />
            </nav>

            <div
              className="border-t border-white/[0.06] px-4 py-4"
              style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
            >
              {showAdminNav ? (
                <Link
                  href="/internal/admin"
                  onClick={onClose}
                  className="mb-3 flex items-center gap-3 rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-3 py-2.5 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/15"
                >
                  <BookOpen className="h-4 w-4" />
                  Admin tools
                </Link>
              ) : null}
              <p className="flex items-center gap-2 text-[11px] text-white/30">
                <MessageCircle className="h-3.5 w-3.5" />
                URI · Social · RPG
              </p>
            </div>
          </>
        ) : panel === "settings" ? (
          <AppSettingsPanel
            onBack={() => setPanel("menu")}
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
      </aside>
    </>,
    document.body,
  );
}

function DrawerSection({
  title,
  items,
  onSelect,
  badgeId,
  unread = 0,
}: {
  title: string;
  items: MenuItem[];
  onSelect: (id: MenuItem["id"]) => void;
  badgeId?: string;
  unread?: number;
}) {
  return (
    <div className="mb-5">
      <p className="mb-2 px-2 text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-300/45">{title}</p>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onSelect(item.id)}
              className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-white/[0.06] active:scale-[0.99]"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-cyan-200/90 transition group-hover:border-cyan-400/25 group-hover:text-cyan-100">
                {item.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-sm font-semibold text-white/92">{item.label}</span>
                {item.description ? (
                  <span className="block text-[11px] text-white/40">{item.description}</span>
                ) : null}
              </span>
              {badgeId === item.id && unread > 0 ? (
                <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-bold text-white">
                  {Math.min(99, unread)}
                </span>
              ) : item.id === "settings" || item.id === "help" ? (
                <ChevronRight className="h-4 w-4 shrink-0 text-white/25 transition group-hover:text-white/45" />
              ) : null}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
