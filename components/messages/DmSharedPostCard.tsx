"use client";

import { MapPin } from "lucide-react";
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
      disabled={!onOpen}
      className="cq-dm-shared-post w-full max-w-[260px] overflow-hidden rounded-2xl border border-sky-300/20 bg-white/[0.06] text-left transition hover:border-sky-300/35 disabled:cursor-default"
    >
      {preview.imageUrl && !unavailable ? (
        <div className="aspect-[4/3] w-full overflow-hidden bg-black/30">
          <img src={preview.imageUrl} alt="" className="h-full w-full object-cover" />
        </div>
      ) : null}
      <div className="space-y-2 p-3">
        <div className="flex items-center gap-2">
          <span className="cq-avatar-slot h-8 w-8 border border-white/15">
            <AvatarDisplay avatar={preview.authorAvatar} fitParent size={32} showProp={false} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{preview.authorName}</p>
            <p className="truncate text-[11px] text-white/55">@{preview.authorUsername}</p>
          </div>
        </div>
        {unavailable ? (
          <p className="text-xs text-white/60">
            {preview.unavailable ? "Post unavailable" : "This post is private"}
          </p>
        ) : caption ? (
          <p className="line-clamp-2 text-sm leading-snug text-white/85">{caption}</p>
        ) : null}
        {preview.locationName && !unavailable ? (
          <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-uri-keaney/25 bg-uri-keaney/10 px-2 py-0.5 text-[10px] font-medium text-uri-keaney/90">
            <MapPin className="h-3 w-3 shrink-0" aria-hidden />
            <span className="truncate">{preview.locationName}</span>
          </span>
        ) : null}
        {!unavailable ? (
          <span className="inline-block text-xs font-semibold text-uri-keaney">View Post</span>
        ) : null}
      </div>
    </button>
  );
}
