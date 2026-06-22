"use client";

import { AvatarDisplay } from "@/components/AvatarDisplay";
import type { SharedPostPreview } from "@/lib/client/dmMessagesClient";

export function DmSharedPostCard({
  preview,
  onOpen,
}: {
  preview: SharedPostPreview;
  onOpen?: () => void;
}) {
  const unavailable = preview.unavailable || preview.locked;
  const caption = preview.caption?.trim();

  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={!onOpen || unavailable}
      className="cq-dm-shared-post w-full max-w-[220px] overflow-hidden rounded-xl bg-black text-left transition active:opacity-90 disabled:cursor-default"
    >
      {preview.imageUrl && !unavailable ? (
        <div className="aspect-square w-full overflow-hidden bg-[#1a1a1a]">
          <img src={preview.imageUrl} alt="" className="h-full w-full object-cover" />
        </div>
      ) : (
        <div className="flex aspect-square w-full items-center justify-center bg-[#1a1a1a] px-3 text-center text-xs text-white/45">
          {unavailable ? (preview.unavailable ? "Post unavailable" : "Private post") : "No preview"}
        </div>
      )}
      <div className="space-y-1 px-2.5 py-2">
        <div className="flex items-center gap-1.5">
          <span className="h-6 w-6 shrink-0 overflow-hidden rounded-full bg-[#262626]">
            <AvatarDisplay avatar={preview.authorAvatar} fitParent size={24} showProp={false} />
          </span>
          <p className="min-w-0 truncate text-[11px] font-semibold text-white">{preview.authorName}</p>
        </div>
        {!unavailable && caption ? (
          <p className="line-clamp-2 text-[11px] leading-snug text-white/55">{caption}</p>
        ) : null}
      </div>
    </button>
  );
}
