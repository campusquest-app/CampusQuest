"use client";

import { useRef, useState } from "react";
import { Tag } from "lucide-react";
import { clamp01 } from "@/lib/postTags";
import type { FieldNoteTag } from "@/lib/types";
import { patchAuthed } from "@/lib/client/dashboardApi";

/**
 * Overlay for approved photo tags. Parent toggles `visible` on image tap.
 * Authors can drag labels; positions persist via API (0–1 coords).
 */
export function FeedPhotoTags({
  postId,
  tags,
  visible,
  canReposition,
  onRepositioned,
}: {
  postId: string;
  tags: FieldNoteTag[];
  visible: boolean;
  canReposition: boolean;
  onRepositioned?: (tagId: string, x: number, y: number) => void;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [local, setLocal] = useState<Record<string, { x: number; y: number }>>({});
  const latestPosRef = useRef<Record<string, { x: number; y: number }>>({});

  if (!tags.length) return null;

  function pointFromClient(clientX: number, clientY: number) {
    const el = wrapRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: clamp01((clientX - rect.left) / rect.width),
      y: clamp01((clientY - rect.top) / rect.height),
    };
  }

  function beginDrag(tag: FieldNoteTag, clientX: number, clientY: number) {
    if (!canReposition) return;
    const start = pointFromClient(clientX, clientY);
    if (start) {
      latestPosRef.current[tag.id] = start;
      setLocal((prev) => ({ ...prev, [tag.id]: start }));
    }

    const onMove = (ev: PointerEvent) => {
      const next = pointFromClient(ev.clientX, ev.clientY);
      if (!next) return;
      latestPosRef.current[tag.id] = next;
      setLocal((prev) => ({ ...prev, [tag.id]: next }));
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const pos = latestPosRef.current[tag.id];
      if (!pos) return;
      void (async () => {
        try {
          await patchAuthed(`/api/quad/posts/${postId}/tags/${tag.id}`, {
            action: "reposition",
            positionX: pos.x,
            positionY: pos.y,
          });
          onRepositioned?.(tag.id, pos.x, pos.y);
        } catch {
          // Keep optimistic local position.
        }
      })();
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  return (
    <div ref={wrapRef} className="pointer-events-none absolute inset-0 z-[3]">
      <span
        className="pointer-events-none absolute bottom-2 right-2 rounded-full bg-black/55 p-1.5 text-white"
        aria-hidden
      >
        <Tag className="h-3.5 w-3.5" />
      </span>
      {visible
        ? tags.map((t) => {
            const x = local[t.id]?.x ?? t.positionX ?? 0;
            const y = local[t.id]?.y ?? t.positionY ?? 0;
            return (
              <button
                key={t.id}
                type="button"
                className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/75 px-2 py-1 text-[11px] font-semibold text-white shadow ${
                  canReposition
                    ? "pointer-events-auto touch-none cursor-grab active:cursor-grabbing"
                    : "pointer-events-auto"
                }`}
                style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
                onPointerDown={(ev) => {
                  if (!canReposition) return;
                  ev.preventDefault();
                  ev.stopPropagation();
                  beginDrag(t, ev.clientX, ev.clientY);
                }}
                onClick={(ev) => ev.stopPropagation()}
              >
                {t.displayLabel}
              </button>
            );
          })
        : null}
    </div>
  );
}
