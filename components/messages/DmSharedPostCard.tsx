"use client";

import { AvatarDisplay } from "@/components/AvatarDisplay";
import type { SharedPostPreview } from "@/lib/client/dmMessagesClient";

export function DmSharedPostCard({
  preview,
  reason,
  timestamp,
  onOpen,
}: {
  preview: SharedPostPreview;
  /** From message metadata.reason — "tagged_in_post" shows the tagged copy. */
  reason?: string | null;
  timestamp?: string | null;
  onOpen?: () => void;
}) {
  const unavailable = Boolean(preview.unavailable || preview.locked);
  const caption = preview.caption?.trim();
  const isTagged = reason === "tagged_in_post";
  const username = preview.authorUsername?.trim();
  const displayName = preview.authorName?.trim() || username || "Student";

  const timeLabel = (() => {
    if (!timestamp) return null;
    const ms = Date.parse(timestamp);
    if (!Number.isFinite(ms)) return null;
    try {
      return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(ms));
    } catch {
      return null;
    }
  })();

  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={!onOpen || unavailable}
      className="cq-dm-shared-post w-full max-w-[240px] overflow-hidden rounded-xl bg-black text-left transition active:opacity-90 disabled:cursor-default"
    >
      {preview.imageUrl && !unavailable ? (
        <div className="aspect-square w-full overflow-hidden bg-[#1a1a1a]">
          <img src={preview.imageUrl} alt="" className="h-full w-full object-cover" />
        </div>
      ) : (
        <div className="flex aspect-square w-full items-center justify-center bg-[#1a1a1a] px-3 text-center text-xs text-white/45">
          {unavailable
            ? preview.unavailable
              ? "This post is no longer available."
              : "This post is private."
            : "No preview"}
        </div>
      )}
      <div className="space-y-1 px-2.5 py-2">
        <div className="flex items-center gap-1.5">
          <span className="h-6 w-6 shrink-0 overflow-hidden rounded-full bg-[#262626]">
            <AvatarDisplay avatar={preview.authorAvatar} fitParent size={24} showProp={false} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-semibold text-white">
              {username ? `@${username}` : displayName}
            </p>
            {isTagged ? (
              <p className="truncate text-[10px] text-[#0095f6]">Tagged you in a post</p>
            ) : null}
          </div>
          {timeLabel ? <span className="shrink-0 text-[10px] text-white/35">{timeLabel}</span> : null}
        </div>
        {!unavailable && caption ? (
          <p className="line-clamp-2 text-[11px] leading-snug text-white/55">{caption}</p>
        ) : null}
      </div>
    </button>
  );
}
