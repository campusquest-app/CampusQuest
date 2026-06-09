"use client";

import { ChevronLeft, Map } from "lucide-react";
import { RealmMap } from "@/components/realm/RealmMap";
import type { RealmLocation } from "@/lib/realm/locations";

export function TheRealm({
  onBack,
  userId = null,
  isAdmin = false,
  userRole = "student",
}: {
  onBack?: () => void;
  userId?: string | null;
  isAdmin?: boolean;
  userRole?: string;
}) {
  function handleViewQuests(_location: RealmLocation) {
    // Quest flow connects later — keep mock-only for now.
  }

  return (
    <div className="cq-realm-page mx-auto w-full max-w-3xl pb-8">
      <header className="mb-4 flex items-start gap-2">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] text-white/70 transition hover:bg-white/[0.06] hover:text-white active:scale-95 touch-manipulation"
            aria-label="Back to home"
          >
            <ChevronLeft className="h-5 w-5" strokeWidth={2.2} />
          </button>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Map className="h-5 w-5 text-cyan-300/80" strokeWidth={2} />
            <p className="font-display text-[11px] font-bold uppercase tracking-[0.28em] text-cyan-300/55">
              Campus Map
            </p>
          </div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">THE REALM</h1>
          <p className="mt-1 text-sm text-white/50">Find your way around URI — tap a pin for quests and events.</p>
        </div>
      </header>

      <RealmMap onViewQuests={handleViewQuests} userId={userId} isAdmin={isAdmin} userRole={userRole} />

      <p className="mt-3 px-1 text-center text-[10px] uppercase tracking-[0.18em] text-white/25">
        URI Kingston campus map
      </p>
      <p className="mt-1 px-1 text-center text-[11px] text-white/30">
        Pinch or drag to explore · Tap a location for details
      </p>
    </div>
  );
}
