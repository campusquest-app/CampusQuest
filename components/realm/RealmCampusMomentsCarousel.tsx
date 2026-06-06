"use client";

import { useState } from "react";
import type { RealmMoment } from "@/lib/realm/locations";

export function RealmCampusMomentsCarousel({ moments }: { moments: RealmMoment[] }) {
  const [index, setIndex] = useState(0);

  if (moments.length === 0) {
    return (
      <div className="rounded-2xl border border-white/[0.08] bg-black/20 px-4 py-10 text-center">
        <p className="text-sm leading-relaxed text-white/55">
          No memories forged here yet. Be the first to post from this location.
        </p>
      </div>
    );
  }

  const active = moments[index] ?? moments[0];

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.1] bg-cq-card/80 p-3">
        <div className="realm-moments-stack relative mx-auto max-w-sm">
          {moments.slice(index + 1, index + 3).reverse().map((m, i) => (
            <div
              key={m.id}
              className="realm-moments-stack-card pointer-events-none absolute inset-x-3 rounded-xl border border-white/[0.06] bg-cq-secondary/60"
              style={{
                top: `${(i + 1) * 6}px`,
                transform: `scale(${0.94 - i * 0.03}) translateY(${i * 4}px)`,
                opacity: 0.35 - i * 0.1,
                zIndex: 1,
              }}
              aria-hidden
            >
              <div className="aspect-[4/3] rounded-xl bg-black/30" />
            </div>
          ))}

          <article className="relative z-10 overflow-hidden rounded-xl border border-cyan-400/15 shadow-[0_12px_40px_-12px_rgba(76,201,255,0.35)]">
            <div className="aspect-[4/3] bg-black/40">
              <img src={active.imageUrl} alt="" className="h-full w-full object-cover" />
            </div>
            <div className="border-t border-white/[0.08] bg-gradient-to-b from-cq-card/95 to-cq-secondary/95 p-3">
              <p className="text-sm leading-relaxed text-white/85">{active.caption}</p>
              <p className="mt-2 text-[11px] text-white/40">
                @{active.username} · {active.timestamp}
              </p>
            </div>
          </article>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 px-1">
        <button
          type="button"
          disabled={index <= 0}
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          className="rounded-xl border border-white/[0.1] px-3 py-2 text-xs font-medium text-white/70 disabled:opacity-35"
        >
          Prev
        </button>
        <div className="flex gap-1.5">
          {moments.map((m, i) => (
            <button
              key={m.id}
              type="button"
              aria-label={`Photo ${i + 1}`}
              onClick={() => setIndex(i)}
              className={`h-1.5 rounded-full transition-all ${
                i === index ? "w-5 bg-cyan-400" : "w-1.5 bg-white/25"
              }`}
            />
          ))}
        </div>
        <button
          type="button"
          disabled={index >= moments.length - 1}
          onClick={() => setIndex((i) => Math.min(moments.length - 1, i + 1))}
          className="rounded-xl border border-white/[0.1] px-3 py-2 text-xs font-medium text-white/70 disabled:opacity-35"
        >
          Next
        </button>
      </div>
    </div>
  );
}
