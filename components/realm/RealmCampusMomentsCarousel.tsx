"use client";

import { useState } from "react";
import { AvatarDisplay } from "@/components/AvatarDisplay";
import { avatarPayloadForDisplay, getMomentCaption } from "@/lib/realm/momentDisplay";
import type { RealmMoment } from "@/lib/realm/locations";

export function RealmCampusMomentsCarousel({
  moments,
  onViewPost,
}: {
  moments: RealmMoment[];
  onViewPost?: (postId: string) => void;
}) {
  const [index, setIndex] = useState(0);

  if (moments.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-100 px-4 py-10 text-center">
        <p className="text-sm leading-relaxed text-slate-500">
          No active Moments here yet. Post publicly with this location to add one for 24 hours.
        </p>
      </div>
    );
  }

  const active = moments[index] ?? moments[0];
  const caption = getMomentCaption(active);
  const imageUrl = typeof active.imageUrl === "string" ? active.imageUrl.trim() : "";
  const displayName = typeof active.displayName === "string" ? active.displayName : "Student";
  const username = typeof active.username === "string" ? active.username : "student";
  const postedAgo = typeof active.postedAgoLabel === "string" ? active.postedAgoLabel : active.timestamp;
  const expiresIn = typeof active.expiresInLabel === "string" ? active.expiresInLabel : "";

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="realm-moments-stack relative mx-auto max-w-sm" data-cq-gesture-block="swipe-tab">
          {moments.slice(index + 1, index + 3).reverse().map((m, i) => (
            <div
              key={m.id}
              className="realm-moments-stack-card pointer-events-none absolute inset-x-3 rounded-xl border border-slate-200 bg-cq-secondary/60"
              style={{
                top: `${(i + 1) * 6}px`,
                transform: `scale(${0.94 - i * 0.03}) translateY(${i * 4}px)`,
                opacity: 0.35 - i * 0.1,
                zIndex: 1,
              }}
              aria-hidden
            >
              <div className="aspect-[4/3] rounded-xl bg-slate-100" />
            </div>
          ))}

          <article className="relative z-10 overflow-hidden rounded-xl border border-cyan-400/15 shadow-[0_12px_40px_-12px_rgba(76,201,255,0.35)]">
            {imageUrl ? (
              <div className="aspect-[4/3] bg-black/40">
                <img src={imageUrl} alt="" className="h-full w-full object-cover" />
              </div>
            ) : (
              <div className="flex aspect-[4/3] items-center justify-center bg-gradient-to-br from-cq-secondary/80 to-black/50 px-6 text-center">
                <p className="text-sm leading-relaxed text-slate-600">{caption}</p>
              </div>
            )}
            <div className="border-t border-slate-200 bg-white p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-100">
                  <AvatarDisplay
                    avatar={avatarPayloadForDisplay(active.authorAvatar)}
                    size={32}
                    showProp={false}
                  />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{displayName}</p>
                  <p className="truncate text-[11px] text-slate-500">@{username}</p>
                </div>
              </div>
              {imageUrl && caption ? (
                <p className="text-sm leading-relaxed text-slate-700">{caption}</p>
              ) : null}
              <p className="mt-2 text-[11px] text-slate-400">
                {postedAgo}
                {expiresIn ? ` · ${expiresIn}` : ""}
              </p>
              {onViewPost ? (
                <button
                  type="button"
                  onClick={() => onViewPost(active.postId)}
                  className="mt-3 w-full rounded-lg border border-uri-keaney/30 bg-uri-keaney/10 px-3 py-2 text-xs font-semibold text-uri-keaney hover:bg-uri-keaney/15"
                >
                  View on Quad
                </button>
              ) : null}
            </div>
          </article>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 px-1">
        <button
          type="button"
          disabled={index <= 0}
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 disabled:opacity-35"
        >
          Prev
        </button>
        <div className="flex gap-1.5">
          {moments.map((m, i) => (
            <button
              key={m.id}
              type="button"
              aria-label={`Moment ${i + 1}`}
              onClick={() => setIndex(i)}
              className={`h-1.5 rounded-full transition-all ${
                i === index ? "w-5 bg-uri-keaney" : "w-1.5 bg-slate-300"
              }`}
            />
          ))}
        </div>
        <button
          type="button"
          disabled={index >= moments.length - 1}
          onClick={() => setIndex((i) => Math.min(moments.length - 1, i + 1))}
          className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 disabled:opacity-35"
        >
          Next
        </button>
      </div>
    </div>
  );
}
