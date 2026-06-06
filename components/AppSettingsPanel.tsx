"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import {
  Bell,
  ChevronRight,
  GraduationCap,
  LogOut,
  Moon,
  QrCode,
  Shield,
  User,
  UserCircle,
  Volume2,
  type LucideIcon,
} from "lucide-react";
import { DrawerSubPanelShell } from "./DrawerSubPanelShell";

export type SettingsActionId =
  | "account"
  | "profile-character"
  | "notifications"
  | "privacy"
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
      { id: "profile-character", label: "Profile & Character", description: "Avatar, stats, bio", icon: UserCircle },
      { id: "notifications", label: "Notifications", description: "Alerts and inbox", icon: Bell },
    ],
  },
  {
    title: "Safety & campus",
    rows: [
      { id: "privacy", label: "Privacy & Safety", description: "Privacy policy and community rules", icon: Shield },
      { id: "campus", label: "Campus / School", description: "School verification and campus access", icon: GraduationCap },
      { id: "qr-permissions", label: "QR Scanner Permissions", description: "Camera access for CQ Scan", icon: QrCode },
    ],
  },
  {
    title: "Experience",
    rows: [
      { id: "appearance", label: "Appearance", description: "Dark theme (CampusQuest navy)", icon: Moon },
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
  musicMuted,
}: {
  onBack: () => void;
  onAction: (id: SettingsActionId) => void;
  musicMuted?: boolean;
}) {
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  function handleRow(id: SettingsActionId) {
    if (id === "sign-out") {
      setConfirmSignOut(true);
      return;
    }
    onAction(id);
  }

  return (
    <>
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
                  return (
                    <li key={row.id} className={!isLast ? "border-b border-white/[0.06]" : undefined}>
                      <button
                        type="button"
                        onClick={() => handleRow(row.id)}
                        className="group flex w-full items-center gap-3 px-3 py-3.5 text-left transition hover:bg-white/[0.04] active:scale-[0.995] touch-manipulation"
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-cyan-200/90">
                          <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-white/92">{row.label}</span>
                          <span className="block text-[11px] text-white/40">
                            {soundHint ? `${row.description} · ${soundHint}` : row.description}
                          </span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-white/25 transition group-hover:text-white/45" />
                      </button>
                    </li>
                  );
                })}
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

      {confirmSignOut && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[100] flex items-end justify-center bg-black/65 p-4 backdrop-blur-sm sm:items-center"
              role="dialog"
              aria-modal="true"
              aria-labelledby="settings-sign-out-title"
              onClick={() => setConfirmSignOut(false)}
            >
              <div
                className="w-full max-w-sm rounded-2xl border border-white/[0.1] bg-cq-card p-5 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <h3 id="settings-sign-out-title" className="font-display text-lg font-bold text-white">
                  Sign out?
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-white/55">
                  You can sign back in anytime. Your progress is saved to your account.
                </p>
                <div className="mt-5 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmSignOut(false)}
                    className="flex-1 rounded-xl border border-white/[0.12] py-2.5 text-sm font-medium text-white/75 hover:bg-white/[0.06]"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmSignOut(false);
                      onAction("sign-out");
                    }}
                    className="flex-1 rounded-xl bg-rose-500/90 py-2.5 text-sm font-semibold text-white hover:bg-rose-500"
                  >
                    Sign Out
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
