"use client";

import {
  Ban,
  Bell,
  ChevronRight,
  GraduationCap,
  IdCard,
  LogOut,
  Moon,
  QrCode,
  Shield,
  Tag,
  Trash2,
  User,
  UserCircle,
  Volume2,
  type LucideIcon,
} from "lucide-react";
import { DrawerSubPanelShell } from "./DrawerSubPanelShell";

export type SettingsActionId =
  | "account"
  | "account-type"
  | "profile-character"
  | "notifications"
  | "push-notifications"
  | "privacy"
  | "blocked-users"
  | "tags-mentions"
  | "delete-account"
  | "campus"
  | "qr-permissions"
  | "appearance"
  | "sound"
  | "sign-out";

type SettingsRow = {
  id: SettingsActionId;
  label: string;
  description?: string;
  icon: LucideIcon;
  danger?: boolean;
};

const SETTINGS_SECTIONS: { title: string; rows: SettingsRow[] }[] = [
  {
    title: "Account",
    rows: [
      { id: "account", label: "Account", description: "Name, username, sign-in", icon: User },
      { id: "account-type", label: "Account Type", description: "Student or Faculty / Staff", icon: IdCard },
      { id: "profile-character", label: "Profile & Character", description: "Avatar, stats, bio", icon: UserCircle },
      { id: "notifications", label: "Inbox", description: "In-app alerts and activity", icon: Bell },
      {
        id: "push-notifications",
        label: "Push notifications",
        description: "Phone alerts for messages and social activity",
        icon: Bell,
      },
      {
        id: "delete-account",
        label: "Delete account",
        description: "Permanently remove your CampusQuest account",
        icon: Trash2,
        danger: true,
      },
    ],
  },
  {
    title: "Safety & campus",
    rows: [
      {
        id: "privacy",
        label: "Privacy, Terms & Support",
        description: "Policies, permissions, and how to get help",
        icon: Shield,
      },
      {
        id: "blocked-users",
        label: "Blocked users",
        description: "Manage people you’ve blocked",
        icon: Ban,
      },
      {
        id: "tags-mentions",
        label: "Tags and mentions",
        description: "Control who can tag or @mention you",
        icon: Tag,
      },
      { id: "campus", label: "Campus / School", description: "School verification and campus access", icon: GraduationCap },
      { id: "qr-permissions", label: "Camera & QR permissions", description: "Camera access for CQ Scan", icon: QrCode },
    ],
  },
  {
    title: "Experience",
    rows: [
      { id: "appearance", label: "Appearance", description: "CampusQuest uses a dark theme", icon: Moon },
      {
        id: "sound",
        label: "Sound & Haptics",
        description: "Game music and feedback sounds",
        icon: Volume2,
      },
    ],
  },
];

export function AppSettingsPanel({
  onBack,
  onAction,
  onRequestSignOut,
  musicMuted,
  showXpProgressBar = false,
  xpProgressBarPrefLoaded = false,
  onToggleShowXpProgressBar,
  xpProgressBarSaveError = null,
}: {
  onBack: () => void;
  onAction: (id: SettingsActionId) => void;
  onRequestSignOut?: () => void;
  musicMuted?: boolean;
  showXpProgressBar?: boolean;
  /** When false, keep the toggle off and disabled so the bar never flashes before prefs resolve. */
  xpProgressBarPrefLoaded?: boolean;
  onToggleShowXpProgressBar?: (next: boolean) => void;
  xpProgressBarSaveError?: string | null;
}) {
  function handleRow(id: SettingsActionId) {
    if (id === "sign-out") {
      onRequestSignOut?.();
      return;
    }
    onAction(id);
  }

  const xpBarChecked = xpProgressBarPrefLoaded && showXpProgressBar;
  const xpBarDisabled = !xpProgressBarPrefLoaded || !onToggleShowXpProgressBar;

  return (
    <DrawerSubPanelShell title="Settings" onBack={onBack}>
        <div className="space-y-5">
          {SETTINGS_SECTIONS.map((section) => (
            <section key={section.title}>
              <p className="mb-2 px-2 text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-300/45">
                {section.title}
              </p>
              <ul className="overflow-hidden rounded-2xl border border-white/[0.08] bg-cq-card/60">
                {section.rows.map((row, index) => {
                  const Icon = row.icon;
                  const isLast = index === section.rows.length - 1;
                  const soundHint = row.id === "sound" && musicMuted != null ? (musicMuted ? "Muted" : "On") : null;
                  const isExperienceLastNav = section.title === "Experience" && isLast;
                  return (
                    <li key={row.id} className={!isLast || isExperienceLastNav ? "border-b border-white/[0.06]" : undefined}>
                      <button
                        type="button"
                        onClick={() => handleRow(row.id)}
                        className="group flex w-full items-center gap-3 px-3 py-3.5 text-left transition hover:bg-white/[0.04] active:scale-[0.995] touch-manipulation"
                      >
                        <span
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${
                            row.danger
                              ? "border-rose-400/25 bg-rose-500/10 text-rose-200"
                              : "border-white/[0.08] bg-white/[0.04] text-cyan-200/90"
                          }`}
                        >
                          <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span
                            className={`block text-sm font-semibold ${
                              row.danger ? "text-rose-100" : "text-white/92"
                            }`}
                          >
                            {row.label}
                          </span>
                          <span className={`block text-[11px] ${row.danger ? "text-rose-200/50" : "text-white/40"}`}>
                            {soundHint ? `${row.description} · ${soundHint}` : row.description}
                          </span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-white/25 transition group-hover:text-white/45" />
                      </button>
                    </li>
                  );
                })}
                {section.title === "Experience" ? (
                  <li>
                    <div className="flex w-full items-center gap-3 px-3 py-3.5">
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-white/92">Show XP progress bar</span>
                        <span className="block text-[11px] text-white/40">
                          Display your level, XP progress, and streak at the top of the app.
                        </span>
                        {xpProgressBarSaveError ? (
                          <span className="mt-1 block text-[11px] text-rose-300/90" role="status" aria-live="polite">
                            {xpProgressBarSaveError}
                          </span>
                        ) : null}
                      </span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={xpBarChecked}
                        aria-label="Show XP progress bar"
                        disabled={xpBarDisabled}
                        onClick={() => onToggleShowXpProgressBar?.(!xpBarChecked)}
                        className={`relative h-7 w-12 shrink-0 rounded-full transition touch-manipulation disabled:opacity-40 ${
                          xpBarChecked ? "bg-cyan-400/80" : "bg-white/15"
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition ${
                            xpBarChecked ? "left-[1.35rem]" : "left-0.5"
                          }`}
                          aria-hidden
                        />
                      </button>
                    </div>
                  </li>
                ) : null}
              </ul>
            </section>
          ))}

          <section>
            <ul className="overflow-hidden rounded-2xl border border-rose-400/20 bg-rose-500/[0.06]">
              <li>
                <button
                  type="button"
                  onClick={() => handleRow("sign-out")}
                  className="group flex w-full items-center gap-3 px-3 py-3.5 text-left transition hover:bg-rose-500/[0.08] active:scale-[0.995] touch-manipulation"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-rose-400/25 bg-rose-500/10 text-rose-200">
                    <LogOut className="h-[18px] w-[18px]" strokeWidth={2} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-rose-100">Sign Out</span>
                    <span className="block text-[11px] text-rose-200/50">Log out of CampusQuest on this device</span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-rose-300/40" />
                </button>
              </li>
            </ul>
          </section>
        </div>
    </DrawerSubPanelShell>
  );
}
