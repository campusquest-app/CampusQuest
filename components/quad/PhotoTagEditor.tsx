"use client";

import { useCallback, useRef, useState } from "react";
import { X } from "lucide-react";
import { TagPickerSheet } from "@/components/quad/TagPickerSheet";
import type { ComposerTagSelection, PhotoTagDraft } from "@/lib/postTags";
import { clamp01, tagEntityKey } from "@/lib/postTags";

function draftKey(tag: Pick<PhotoTagDraft, "entityType" | "entityId" | "mediaKey">): string {
  return `${tagEntityKey(tag)}:${tag.mediaKey || "primary"}`;
}

export function PhotoTagEditor({
  open,
  imageUrl,
  tags,
  onChange,
  onClose,
}: {
  open: boolean;
  imageUrl: string;
  tags: PhotoTagDraft[];
  onChange: (next: PhotoTagDraft[]) => void;
  onClose: () => void;
}) {
  const [pendingPoint, setPendingPoint] = useState<{ x: number; y: number } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [activeMenuKey, setActiveMenuKey] = useState<string | null>(null);
  const imageWrapRef = useRef<HTMLDivElement | null>(null);
  const tagsRef = useRef(tags);
  tagsRef.current = tags;
  const dragMovedRef = useRef(false);
  const suppressClickRef = useRef(false);

  const pointFromClient = useCallback((clientX: number, clientY: number) => {
    const el = imageWrapRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: clamp01((clientX - rect.left) / rect.width),
      y: clamp01((clientY - rect.top) / rect.height),
    };
  }, []);

  function beginDrag(tag: PhotoTagDraft, clientX: number, clientY: number) {
    const key = draftKey(tag);
    setDraggingKey(key);
    setActiveMenuKey(null);
    dragMovedRef.current = false;
    const start = pointFromClient(clientX, clientY);
    if (!start) return;

    const onMove = (ev: PointerEvent) => {
      const next = pointFromClient(ev.clientX, ev.clientY);
      if (!next) return;
      if (Math.abs(next.x - start.x) > 0.008 || Math.abs(next.y - start.y) > 0.008) {
        dragMovedRef.current = true;
      }
      onChange(
        tagsRef.current.map((t) =>
          draftKey(t) === key ? { ...t, positionX: next.x, positionY: next.y } : t,
        ),
      );
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setDraggingKey(null);
      if (dragMovedRef.current) {
        suppressClickRef.current = true;
        window.setTimeout(() => {
          suppressClickRef.current = false;
        }, 0);
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[130] flex flex-col bg-black" role="dialog" aria-modal="true" aria-label="Tag photo">
      <header className="flex items-center justify-between px-3 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button type="button" onClick={onClose} className="min-h-[44px] px-2 text-sm text-white/80">
          Done
        </button>
        <p className="text-sm font-semibold text-white">Tag photo · 1 of 1</p>
        <span className="w-12" />
      </header>
      <div className="relative mx-auto flex min-h-0 w-full max-w-lg flex-1 items-center justify-center px-2 pb-[env(safe-area-inset-bottom)]">
        <div
          ref={imageWrapRef}
          className="relative w-full overflow-hidden rounded-xl"
          onClick={(e) => {
            if (suppressClickRef.current || draggingKey) return;
            if ((e.target as HTMLElement).closest("[data-photo-tag]")) return;
            const point = pointFromClient(e.clientX, e.clientY);
            if (!point) return;
            setPendingPoint(point);
            setPickerOpen(true);
            setActiveMenuKey(null);
          }}
          role="button"
          tabIndex={0}
          aria-label="Tap image to add a tag"
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") e.preventDefault();
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt="Tag on photo" className="pointer-events-none max-h-[70vh] w-full object-contain" draggable={false} />
          {tags.map((tag) => {
            const key = draftKey(tag);
            const menuOpen = activeMenuKey === key;
            return (
              <div
                key={key}
                data-photo-tag
                className={`absolute z-10 -translate-x-1/2 -translate-y-1/2 touch-none ${
                  draggingKey === key ? "scale-105" : ""
                }`}
                style={{ left: `${tag.positionX * 100}%`, top: `${tag.positionY * 100}%` }}
              >
                <button
                  type="button"
                  className="min-h-[44px] min-w-[44px] rounded-full bg-black/80 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-lg ring-1 ring-white/25"
                  aria-label={`${tag.displayLabel}. Drag to move, tap for options`}
                  onPointerDown={(ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    beginDrag(tag, ev.clientX, ev.clientY);
                  }}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    if (suppressClickRef.current) return;
                    setActiveMenuKey((prev) => (prev === key ? null : key));
                  }}
                >
                  {tag.displayLabel}
                </button>
                {menuOpen ? (
                  <div className="absolute left-1/2 top-full z-20 mt-1 flex -translate-x-1/2 gap-1 rounded-xl border border-white/15 bg-uri-navy p-1 shadow-xl">
                    <button
                      type="button"
                      className="min-h-[40px] rounded-lg px-3 text-xs font-semibold text-red-300 hover:bg-white/10"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        onChange(tags.filter((t) => draftKey(t) !== key));
                        setActiveMenuKey(null);
                      }}
                    >
                      <span className="inline-flex items-center gap-1">
                        <X className="h-3.5 w-3.5" />
                        Remove
                      </span>
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
      <p className="px-4 pb-4 text-center text-xs text-white/55">
        Tap to add · drag labels to reposition · tap a label to remove
      </p>

      <TagPickerSheet
        open={pickerOpen}
        selected={[]}
        mode="single"
        onClose={() => {
          setPickerOpen(false);
          setPendingPoint(null);
        }}
        onDone={() => {
          setPickerOpen(false);
          setPendingPoint(null);
        }}
        onChange={(next: ComposerTagSelection[]) => {
          const pick = next[0];
          if (!pick || !pendingPoint) return;
          if (tags.length >= 20) return;
          const already = tags.some(
            (t) => tagEntityKey(t) === tagEntityKey(pick) && (t.mediaKey || "primary") === "primary",
          );
          if (already) {
            setPickerOpen(false);
            setPendingPoint(null);
            return;
          }
          onChange([
            ...tags,
            {
              entityType: pick.entityType,
              entityId: pick.entityId,
              mediaKey: "primary",
              positionX: pendingPoint.x,
              positionY: pendingPoint.y,
              displayLabel: pick.displayLabel,
            },
          ]);
          setPickerOpen(false);
          setPendingPoint(null);
        }}
      />
    </div>
  );
}
