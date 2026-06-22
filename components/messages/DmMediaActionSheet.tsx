"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Camera, ImageIcon } from "lucide-react";

export type DmCameraAction = "take_photo" | "choose_library";

export function DmMediaActionSheet({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (action: DmCameraAction) => void;
}) {
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[130] flex items-end justify-center" role="dialog" aria-modal="true" aria-label="Photo options">
      <button type="button" className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" aria-label="Close" onClick={onClose} />
      <div className="relative z-10 mb-[max(0.75rem,env(safe-area-inset-bottom,0px))] w-full max-w-md px-3">
        <div className="overflow-hidden rounded-2xl border border-white/15 bg-uri-navy/95 shadow-2xl backdrop-blur-md">
          <button
            type="button"
            onClick={() => onSelect("take_photo")}
            className="flex w-full items-center gap-3 border-b border-white/10 px-4 py-3.5 text-left text-[15px] font-medium text-white transition hover:bg-white/[0.06] active:bg-white/10"
          >
            <Camera className="h-5 w-5 shrink-0 text-uri-keaney" aria-hidden />
            Take Photo
          </button>
          <button
            type="button"
            onClick={() => onSelect("choose_library")}
            className="flex w-full items-center gap-3 border-b border-white/10 px-4 py-3.5 text-left text-[15px] font-medium text-white transition hover:bg-white/[0.06] active:bg-white/10"
          >
            <ImageIcon className="h-5 w-5 shrink-0 text-uri-keaney" aria-hidden />
            Choose From Library
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex w-full items-center justify-center px-4 py-3.5 text-[15px] font-semibold text-white/75 transition hover:bg-white/[0.04] active:bg-white/10"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
