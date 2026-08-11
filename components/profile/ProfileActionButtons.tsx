"use client";

import { useState } from "react";
import { Settings2, Share2 } from "lucide-react";
import type { Character } from "@/lib/types";

/**
 * Instagram-style action row for the profile owner: Edit Profile, Share Profile,
 * and a compact Settings/menu button. All equal height, rounded, evenly spaced.
 */
export function ProfileActionButtons({
  character,
  onEditProfile,
  onOpenMenu,
}: {
  character: Character;
  onEditProfile?: () => void;
  onOpenMenu?: () => void;
}) {
  const [toast, setToast] = useState<string | null>(null);

  const handleShare = async () => {
    const url = typeof window !== "undefined" ? window.location.origin : "";
    const { nativeShare } = await import("@/lib/client/capacitorNative");
    const result = await nativeShare({
      title: `${character.name} on CampusQuest`,
      text: `Check out @${character.username} (Level ${character.level}) on CampusQuest!`,
      url,
    });
    if (result === "copied") {
      setToast("Profile link copied");
      window.setTimeout(() => setToast(null), 2200);
    }
  };

  return (
    <div className="cq-profile-actions cq-profile-fade-in">
      <div className="cq-profile-actions-row">
        {onEditProfile ? (
          <button type="button" onClick={onEditProfile} className="cq-profile-action-btn cq-profile-press">
            Edit Profile
          </button>
        ) : null}
        <button type="button" onClick={() => void handleShare()} className="cq-profile-action-btn cq-profile-press">
          <Share2 className="h-4 w-4" strokeWidth={2.2} aria-hidden />
          Share Profile
        </button>
        {onOpenMenu ? (
          <button
            type="button"
            onClick={onOpenMenu}
            className="cq-profile-action-btn cq-profile-action-btn--icon cq-profile-press"
            aria-label="Settings"
          >
            <Settings2 className="h-[18px] w-[18px]" strokeWidth={2.2} aria-hidden />
          </button>
        ) : null}
      </div>
      {toast ? (
        <p className="cq-profile-actions-toast" aria-live="polite">
          {toast}
        </p>
      ) : null}
    </div>
  );
}
