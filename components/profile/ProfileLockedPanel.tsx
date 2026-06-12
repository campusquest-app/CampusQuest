"use client";

import { Lock } from "lucide-react";

export function ProfileLockedPanel({ mutualFriendsCount }: { mutualFriendsCount?: number }) {
  return (
    <div className="cq-profile-locked px-4 py-12 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-white/15 bg-white/[0.04]">
        <Lock className="h-6 w-6 text-white/55" aria-hidden strokeWidth={2} />
      </div>
      <h2 className="font-display text-base font-bold text-white">This profile is private</h2>
      <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-white/55">
        Connect with this Ram to see their posts and campus activity.
      </p>
      {mutualFriendsCount != null && mutualFriendsCount > 0 ? (
        <p className="mt-3 text-xs font-medium text-uri-keaney/90">
          {mutualFriendsCount} mutual {mutualFriendsCount === 1 ? "friend" : "friends"}
        </p>
      ) : null}
    </div>
  );
}
