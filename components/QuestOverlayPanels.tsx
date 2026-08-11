"use client";

import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import type { Character } from "@/lib/types";
import { SpecialQuests } from "@/components/SpecialQuests";
import { TOPNAV_CSS_VAR } from "@/components/TopNav";

const questsPanelBoxClass =
  "fixed left-3 right-3 z-[101] max-h-[calc(100dvh-var(--cq-topnav-h,56px)-env(safe-area-inset-bottom,0px)-12px)] overflow-y-auto sm:left-1/2 sm:right-auto sm:w-[min(34rem,92vw)] sm:max-h-[min(70dvh,calc(100dvh-var(--cq-topnav-h,56px)-env(safe-area-inset-bottom,0px)-16px))] sm:-translate-x-1/2";

function QuestDropdownChrome({ children }: { children: ReactNode }) {
  return (
    <div className={questsPanelBoxClass} style={{ top: `calc(var(${TOPNAV_CSS_VAR}, 3.5rem) + 8px)` }}>
      {children}
    </div>
  );
}

export function QuestOverlayPanels({
  character,
  specialOpen,
  onCloseSpecial,
  onRefresh,
}: {
  character: Character | null;
  specialOpen: boolean;
  onCloseSpecial: () => void;
  onRefresh?: () => void;
}) {
  if (typeof document === "undefined" || !character) return null;

  return createPortal(
    <>
      {specialOpen ? (
        <>
          <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-[1px]" onClick={onCloseSpecial} aria-hidden />
          <QuestDropdownChrome>
            <div
              className="overflow-hidden rounded-2xl border-2 border-uri-gold/50 bg-cq-card ring-1 ring-black/20"
              style={{
                boxShadow:
                  "0 0 0 1px rgba(197, 165, 40, 0.2), 0 12px 40px -8px rgba(0,0,0,0.5), 0 0 32px rgba(197, 165, 40, 0.1)",
              }}
            >
              <div className="h-1 bg-gradient-to-r from-transparent via-amber-400/60 to-transparent" aria-hidden />
              <SpecialQuests character={character} compact onClaim={onRefresh} />
            </div>
          </QuestDropdownChrome>
        </>
      ) : null}
    </>,
    document.body,
  );
}
