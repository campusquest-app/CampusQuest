"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Character } from "@/lib/types";
import { DailyQuests } from "@/components/DailyQuests";
import { SpecialQuests } from "@/components/SpecialQuests";
import { isServerBackedUserId } from "@/lib/client/gameStateSync";
import { useSaveStatus } from "@/lib/client/useSaveStatus";
import { Camera, QrCode } from "lucide-react";

/** Synced by ResizeObserver — quest drawers use fixed top below this pixel height */
const TOPNAV_CSS_VAR = "--cq-topnav-h";

export type TopNavProps = {
  username: string | null;
  character: Character | null;
  onRefresh?: () => void;
  onOpenInbox?: () => void;
  unreadNotificationCount?: number;
  showAdminNav?: boolean;
  onOpenQrScanner?: () => void;
};

const questsPanelBoxClass =
  "fixed left-3 right-3 z-[101] max-h-[calc(100vh-var(--cq-topnav-h,72px)-env(safe-area-inset-bottom,0px)-12px)] overflow-y-auto sm:left-1/2 sm:right-auto sm:w-[min(34rem,92vw)] sm:max-h-[min(70vh,calc(100vh-var(--cq-topnav-h,72px)-env(safe-area-inset-bottom,0px)-16px))] sm:-translate-x-1/2";

function QuestDropdownChrome({ children }: { children: ReactNode }) {
  return (
    <div className={questsPanelBoxClass} style={{ top: `calc(var(${TOPNAV_CSS_VAR}, 4rem) + 8px)` }}>
      {children}
    </div>
  );
}

/** Main app sticky header — grid layout, measurable height (no negative margins). */
export function TopNav({
  username,
  character,
  onRefresh,
  onOpenInbox,
  unreadNotificationCount,
  showAdminNav,
  onOpenQrScanner,
}: TopNavProps) {
  const [questsOpen, setQuestsOpen] = useState(false);
  const [specialQuestsOpen, setSpecialQuestsOpen] = useState(false);
  const shellRef = useRef<HTMLElement | null>(null);
  const saveSnap = useSaveStatus();

  useLayoutEffect(() => {
    const el = shellRef.current;
    if (!el || typeof document === "undefined") return undefined;

    const sync = (): void => {
      const raw = Math.ceil(el.getBoundingClientRect().height);
      document.documentElement.style.setProperty(TOPNAV_CSS_VAR, `${Math.max(64, raw)}px`);
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
      document.documentElement.style.removeProperty(TOPNAV_CSS_VAR);
    };
  }, []);

  const saveLabel =
    character && isServerBackedUserId(character.id)
      ? saveSnap.status === "saving"
        ? "Saving…"
        : saveSnap.status === "saved"
          ? "Saved"
          : saveSnap.status === "failed"
            ? "Save failed"
            : saveSnap.dirty
              ? "Unsaved changes"
              : null
      : null;

  const portal =
    typeof document !== "undefined" ? (
      <>
        {questsOpen && character ? (
          createPortal(
            <>
              <div
                className="fixed inset-0 z-[100] bg-black/30 cursor-default"
                onClick={() => setQuestsOpen(false)}
                aria-hidden
              />
              <QuestDropdownChrome>
                <div className="rounded-2xl border border-uri-keaney/40 bg-[#041E42] shadow-xl shadow-black/40 ring-1 ring-black/20 overflow-hidden">
                  <DailyQuests character={character} compact />
                </div>
              </QuestDropdownChrome>
            </>,
            document.body,
          )
        ) : null}
        {specialQuestsOpen && character ? (
          createPortal(
            <>
              <div
                className="fixed inset-0 z-[100] bg-black/30 cursor-default"
                onClick={() => setSpecialQuestsOpen(false)}
                aria-hidden
              />
              <QuestDropdownChrome>
                <div
                  className="rounded-2xl overflow-hidden border-2 border-uri-gold/60 bg-[#041E42] ring-1 ring-black/20"
                  style={{
                    boxShadow:
                      "0 0 0 1px rgba(197, 165, 40, 0.25), 0 12px 40px -8px rgba(0,0,0,0.5), 0 0 40px rgba(197, 165, 40, 0.12)",
                    background:
                      "linear-gradient(175deg, rgba(197, 165, 40, 0.12) 0%, rgba(197, 165, 40, 0.04) 8%, #041E42 18%, #041E42 100%)",
                  }}
                >
                  <div className="h-1.5 bg-gradient-to-r from-transparent via-amber-400/70 to-transparent" aria-hidden />
                  <div className="h-px bg-gradient-to-r from-transparent via-uri-gold/40 to-transparent" aria-hidden />
                  <SpecialQuests character={character} compact onClaim={onRefresh ?? undefined} />
                </div>
              </QuestDropdownChrome>
            </>,
            document.body,
          )
        ) : null}
      </>
    ) : null;

  return (
    <>
      <header
        ref={shellRef}
        className="sticky top-0 z-50 mb-4 w-full shrink-0 border-b border-uri-keaney/20 bg-uri-navy/85 backdrop-blur-xl sm:mb-5"
        style={{
          background: "linear-gradient(180deg, rgba(4, 30, 66, 0.92) 0%, rgba(3, 22, 48, 0.9) 100%)",
          boxShadow: "0 1px 0 0 rgba(104, 171, 232, 0.12)",
          paddingTop: "env(safe-area-inset-top, 0px)",
        }}
      >
        <div className="mx-auto grid h-full min-h-[64px] w-full max-w-2xl grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3 sm:px-4 pb-3 pt-3 sm:pb-3 sm:pt-3">
          {/* LEFT — brand, CQ Scanner (left-aligned), title */}
          <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
            <div className="h-10 w-10 shrink-0 rounded-xl bg-gradient-to-br from-uri-keaney/30 to-uri-keaney/10 border border-uri-keaney/40 flex items-center justify-center shadow-[0_0_12px_rgba(104,171,232,0.2)]">
              <span className="text-[15px] sm:text-base font-bold text-uri-keaney leading-none">CQ</span>
            </div>
            {character && onOpenQrScanner ? (
              <button
                type="button"
                onClick={onOpenQrScanner}
                aria-label="Open CQ Scanner to scan CampusQuest QR codes for XP"
                title="CQ Scanner — scan official CampusQuest QR codes for XP and stat boosts"
                className="cq-qr-nav-glow group flex h-11 max-w-[min(100%,11rem)] min-h-[44px] shrink-0 items-center justify-center gap-1.5 overflow-hidden whitespace-nowrap rounded-full border border-uri-keaney/55 bg-gradient-to-r from-uri-keaney/45 via-[#4a90c8]/35 to-uri-keaney/40 px-3 text-white shadow-[0_0_22px_-4px_rgba(104,171,232,0.65),inset_0_1px_0_rgba(255,255,255,0.1)] hover:border-uri-keaney/85 hover:brightness-[1.06] active:scale-[0.97] touch-manipulation transition-transform sm:max-w-none sm:gap-2 sm:px-4"
              >
                <Camera className="h-[18px] w-[18px] shrink-0 text-sky-100 sm:h-5 sm:w-5" strokeWidth={2.2} aria-hidden />
                <QrCode className="h-4 w-4 shrink-0 text-white/95 sm:h-[18px] sm:w-[18px]" strokeWidth={2.2} aria-hidden />
                <span className="font-display text-xs font-bold leading-none tracking-tight sm:text-sm max-[360px]:hidden">
                  <span className="sm:hidden">Scan</span>
                  <span className="hidden sm:inline">CQ Scan</span>
                </span>
              </button>
            ) : null}
            <div className="min-w-0 flex-1 truncate">
              <h1 className="font-display font-bold text-white text-xs sm:text-sm md:text-base tracking-tight truncate">
                CampusQuest
              </h1>
              <p className="text-[10px] sm:text-xs text-uri-keaney/80 font-medium truncate">
                {username ? `@${username}` : "Level Up Your College Experience"}
              </p>
              {saveLabel ? (
                <p className="truncate text-[9px] text-white/45 sm:text-[10px]" aria-live="polite">
                  {saveLabel}
                </p>
              ) : null}
            </div>
          </div>

          {/* RIGHT */}
          <div className="flex min-w-0 items-center justify-end justify-self-end gap-1 sm:gap-2">
            {showAdminNav ? (
              <div className="shrink-0" role="navigation" aria-label="Internal admin">
                <Link
                  href="/internal/admin"
                  className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-emerald-400/45 bg-emerald-500/[0.12] px-1.5 py-2 text-[10px] font-semibold text-emerald-100 hover:bg-emerald-500/20 sm:px-2.5 sm:text-xs"
                >
                  Admin
                </Link>
              </div>
            ) : null}

            {character ? (
              <div
                className="flex max-w-full shrink-0 items-center gap-0 rounded-xl border border-white/15 bg-white/5 p-0.5 shadow-inner sm:gap-0.5 sm:p-1"
                role="group"
                aria-label="Quick actions"
              >
                <button
                  type="button"
                  onClick={() => {
                    setSpecialQuestsOpen(false);
                    setQuestsOpen((v) => !v);
                  }}
                  className={`flex h-11 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center gap-1 rounded-lg px-2 text-sm font-medium transition-all sm:min-w-0 sm:px-3 ${
                    questsOpen
                      ? "bg-uri-keaney/25 text-uri-keaney ring-1 ring-uri-keaney/40"
                      : "text-white/90 hover:bg-white/10 hover:text-white"
                  }`}
                  aria-haspopup="dialog"
                  aria-expanded={questsOpen}
                  title="Daily quests"
                >
                  <span className="text-lg leading-none" aria-hidden>
                    📋
                  </span>
                  <span className="hidden lg:inline truncate">Daily</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setQuestsOpen(false);
                    setSpecialQuestsOpen((v) => !v);
                  }}
                  className={`flex h-11 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center gap-1 rounded-lg px-2 text-sm font-medium transition-all sm:min-w-0 sm:px-3 ${
                    specialQuestsOpen
                      ? "bg-uri-gold/20 text-uri-gold ring-1 ring-uri-gold/50"
                      : "text-white/90 hover:bg-white/10 hover:text-white"
                  }`}
                  aria-haspopup="dialog"
                  aria-expanded={specialQuestsOpen}
                  title="Special quests"
                >
                  <span className="text-lg leading-none" aria-hidden>
                    ⭐
                  </span>
                  <span className="hidden lg:inline truncate">Special</span>
                </button>

                {onOpenInbox ? (
                  <button
                    type="button"
                    onClick={onOpenInbox}
                    className="relative flex h-11 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center gap-1 rounded-lg px-2 text-sm font-medium text-white/90 hover:bg-white/10 sm:px-3"
                    title="Inbox — messages and notifications"
                    aria-label={
                      (unreadNotificationCount ?? 0) > 0
                        ? `Inbox, ${Math.min(99, unreadNotificationCount ?? 0)} unread`
                        : "Inbox — messages and notifications"
                    }
                  >
                    <span className="text-lg leading-none" aria-hidden>
                      📬
                    </span>
                    <span className="hidden lg:inline truncate">Inbox</span>
                    {(unreadNotificationCount ?? 0) > 0 ? (
                      <span className="absolute right-1 top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-0.5 text-[9px] font-bold text-white sm:right-1.5 sm:text-[10px]">
                        {Math.min(99, unreadNotificationCount ?? 0)}
                      </span>
                    ) : null}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </header>
      {portal}
    </>
  );
}
