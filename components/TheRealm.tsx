"use client";

import { useEffect, useState } from "react";
import { ChevronLeft } from "lucide-react";
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
  personalization = null,
  showArrival = false,
  onArrivalExplore,
  onArrivalViewFeed,
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
  personalization?: {
    schoolName?: string | null;
    institutionId?: string | null;
    interests?: string[] | null;
    communities?: string[] | null;
    studentStatus?: string | null;
    classYear?: number | null;
  } | null;
  showArrival?: boolean;
  onArrivalExplore?: () => void;
  onArrivalViewFeed?: () => void;
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
    <div className={`cq-realm-immersive cq-realm-immersive--map-first${entered ? " cq-realm-immersive--entered" : ""}`}>
      {onBack ? (
        <header className="cq-realm-immersive-header cq-realm-immersive-header--minimal">
          <button
            type="button"
            onClick={onBack}
            className="cq-realm-immersive-back touch-manipulation"
            aria-label="Back to home"
          >
            <ChevronLeft className="h-5 w-5" strokeWidth={2.2} />
          </button>
        </header>
      ) : null}

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
          personalization={personalization}
          showArrival={showArrival}
          onArrivalExplore={onArrivalExplore}
          onArrivalViewFeed={onArrivalViewFeed}
        />
      </div>
    </div>
  );
}
