"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, Map } from "lucide-react";
import { RealmMap } from "@/components/realm/RealmMap";
import type { RealmLocation } from "@/lib/realm/locations";
import type { SharePostTarget } from "@/lib/client/dmMessagesClient";

export function TheRealm({
  onBack,
  onCreatePost,
  onViewProfile,
  onSharePost,
  onViewQuests,
  onOpenOrganization,
  viewer = null,
  userId = null,
  isAdmin = false,
  userRole = "student",
  isActive = true,
}: {
  onBack?: () => void;
  onCreatePost?: () => void;
  onViewProfile?: (userId: string) => void;
  onSharePost?: (target: SharePostTarget) => void;
  onViewQuests?: (location: RealmLocation) => void;
  onOpenOrganization?: (organizationId: string) => void;
  viewer?: { id: string; name: string; username: string; avatar: string } | null;
  userId?: string | null;
  isAdmin?: boolean;
  userRole?: string;
  isActive?: boolean;
}) {
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setEntered(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  function handleViewQuests(location: RealmLocation) {
    onViewQuests?.(location);
  }

  return (
    <div className={`cq-realm-immersive${entered ? " cq-realm-immersive--entered" : ""}`}>
      <header className="cq-realm-immersive-header">
        <div className="cq-realm-immersive-header-row">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="cq-realm-immersive-back touch-manipulation"
              aria-label="Back to home"
            >
              <ChevronLeft className="h-5 w-5" strokeWidth={2.2} />
            </button>
          ) : null}
          <div className="cq-realm-immersive-header-copy min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Map className="h-4 w-4 text-uri-keaney" strokeWidth={2} aria-hidden />
              <p className="font-display text-[10px] font-bold uppercase tracking-[0.32em] text-cyan-200/70">
                Campus Map
              </p>
            </div>
            <h1 className="font-display text-[1.65rem] font-bold leading-tight tracking-tight text-white sm:text-[1.85rem]">
              THE REALM
            </h1>
            <p className="mt-0.5 text-[13px] leading-snug text-white/60">
              URI as a living fantasy kingdom — tap a landmark for quests and events.
            </p>
          </div>
        </div>
      </header>

      <div className="cq-realm-immersive-stage">
        <RealmMap
          onViewQuests={handleViewQuests}
          onCreatePost={onCreatePost}
          onViewProfile={onViewProfile}
          onSharePost={onSharePost}
          onOpenOrganization={onOpenOrganization}
          viewer={viewer}
          userId={userId}
          isAdmin={isAdmin}
          userRole={userRole}
          immersive
          isActive={isActive}
        />

        <footer className="cq-realm-immersive-footer" aria-hidden>
          <p className="cq-realm-immersive-footer-title">The Kingdom of Rhody · URI Kingston Campus</p>
          <p className="cq-realm-immersive-footer-copy">Pinch or drag to explore · Tap a landmark for details</p>
        </footer>
      </div>
    </div>
  );
}
