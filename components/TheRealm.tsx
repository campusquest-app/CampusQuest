"use client";

import { useEffect, useState } from "react";
import { RealmMap } from "@/components/realm/RealmMap";
import type { RealmLocation } from "@/lib/realm/locations";
import type { SharePostTarget } from "@/lib/client/dmMessagesClient";

export function TheRealm({
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
  showIntro = false,
  onArrivalExplore,
  onArrivalViewFeed,
  onIntroComplete,
  onIntroSkip,
  onViewAthletics,
  onFindMyCampus,
  onViewAllRecommendations,
  onOpenNotifications,
  onOpenOwnProfile,
  unreadCount = 0,
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
    major?: string | null;
    academicArea?: string | null;
  } | null;
  showArrival?: boolean;
  showIntro?: boolean;
  onArrivalExplore?: () => void;
  onArrivalViewFeed?: () => void;
  onIntroComplete?: () => void;
  onIntroSkip?: () => void;
  onViewAthletics?: () => void;
  onFindMyCampus?: () => void;
  onViewAllRecommendations?: () => void;
  onOpenNotifications?: () => void;
  onOpenOwnProfile?: () => void;
  unreadCount?: number;
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
          showIntro={showIntro}
          onArrivalExplore={onArrivalExplore}
          onArrivalViewFeed={onArrivalViewFeed}
          onIntroComplete={onIntroComplete}
          onIntroSkip={onIntroSkip}
          onViewAthletics={onViewAthletics}
          onFindMyCampus={onFindMyCampus}
          onViewAllRecommendations={onViewAllRecommendations}
          onOpenNotifications={onOpenNotifications}
          onOpenOwnProfile={onOpenOwnProfile}
          unreadCount={unreadCount}
        />
      </div>
    </div>
  );
}
